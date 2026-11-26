-- Manufacturing (first step): the daily production report. The production supervisor records what was made each day:
-- product, quantity, lot number, manufacturing and expiry dates. Submitting locks the report (no approval step).
-- Owner answers 2026-11-26: record only for now (inventory isn't touched; receiving finished goods into stock, materials
-- used, rejects and manpower come with the full manufacturing phase).

-- ================================================================ permissions and numbering
insert into public.permissions (code, module, description, is_restricted) values
  ('production.report', 'manufacturing', 'Fill in and submit daily production reports', false),
  ('production.view',   'manufacturing', 'See everyone''s production reports', false)
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm from (values
  ('manufacturing', 'production.report'), ('manufacturing', 'production.view'),
  ('operations_manager', 'production.report'), ('operations_manager', 'production.view'),
  ('coo', 'production.report'), ('coo', 'production.view'),
  ('qa', 'production.view')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, 'production_report', 'Daily production report', 'DPR' from public.entities e where e.code = 'JDF'
on conflict do nothing;

-- ================================================================ reports
create table public.production_reports (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  report_date date not null default public.manila_today(),
  location_id uuid not null references public.locations(id), -- the plant / kitchen where it was made
  shift text not null default '' check (length(shift) <= 40),
  notes text not null default '' check (length(notes) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.production_reports (report_date desc);
create index on public.production_reports (location_id, report_date desc);
create index on public.production_reports (created_by);
create index on public.production_reports (status);

create table public.production_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.production_reports(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(18, 4) not null check (qty > 0),
  unit_code text not null references public.units(code),
  lot_no text not null check (length(trim(lot_no)) between 1 and 60),
  mfg_date date not null,
  expiry_date date,
  notes text not null default '' check (length(notes) <= 300),
  created_at timestamptz not null default now(),
  constraint expiry_after_mfg check (expiry_date is null or expiry_date >= mfg_date)
);
create index on public.production_report_lines (report_id);
create index on public.production_report_lines (product_id);
create index on public.production_report_lines (product_id, lot_no);

create or replace function public.production_report_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('production_report', new.report_date);
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
    new.submitted_at := null;
    new.submitted_by := null;
    if not exists (select 1 from public.locations where id = new.location_id and type in ('plant', 'warehouse') and active) then
      raise exception 'Choose the plant or kitchen where it was made.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Submitted reports can''t be deleted.'; end if;
    return old;
  end if;
  if old.status = 'submitted' then raise exception 'This report was submitted and is locked.'; end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.production_engine', true), 'off') <> 'on' then
    raise exception 'Use Submit to submit the report.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger production_report_before_write before insert or update or delete on public.production_reports
  for each row execute function public.production_report_before_write();

-- Lines: only on drafts; product must be something made (finished good); unit must be the product's; expiry defaults
-- to mfg date + shelf life.
create or replace function public.production_line_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; p public.products;
begin
  select status into st from public.production_reports where id = coalesce(new.report_id, old.report_id);
  if st <> 'draft' then raise exception 'This report was submitted and is locked.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  select * into p from public.products where id = new.product_id;
  if p.item_type <> 'finished_good' then raise exception '% isn''t a finished good. Only products that are made go on the production report.', p.sku; end if;
  new.lot_no := upper(trim(new.lot_no));
  new.unit_code := coalesce(nullif(new.unit_code, ''), p.base_unit);
  if new.unit_code <> p.base_unit and not exists (select 1 from public.product_units where product_id = p.id and unit_code = new.unit_code) then
    raise exception '% isn''t a unit set up for %.', new.unit_code, p.sku;
  end if;
  if new.expiry_date is null and p.shelf_life_days is not null then new.expiry_date := new.mfg_date + p.shelf_life_days; end if;
  return new;
end $$;
create trigger production_line_before_write before insert or update or delete on public.production_report_lines
  for each row execute function public.production_line_before_write();

-- Submit: needs at least one line; the same product + lot can't be reported twice (across submitted reports).
create or replace function public.submit_production_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.production_reports; dup text;
begin
  select * into r from public.production_reports where id = p_id for update;
  if r.id is null then raise exception 'Report not found.'; end if;
  if not public.has_permission('production.report') then raise exception 'You can''t submit production reports.'; end if;
  if r.created_by <> auth.uid() and not public.has_permission('production.view') then raise exception 'You can only submit your own reports.'; end if;
  if r.status <> 'draft' then raise exception 'This report was already submitted.'; end if;
  if not exists (select 1 from public.production_report_lines where report_id = p_id) then raise exception 'Add what was produced first.'; end if;
  select string_agg(distinct p.sku || ' lot ' || l.lot_no, ', ') into dup
  from public.production_report_lines l join public.products p on p.id = l.product_id
  where l.report_id = p_id and (
    exists (select 1 from public.production_report_lines o where o.report_id = p_id and o.id <> l.id and o.product_id = l.product_id and o.lot_no = l.lot_no)
    or exists (select 1 from public.production_report_lines o join public.production_reports orp on orp.id = o.report_id
               where orp.status = 'submitted' and o.product_id = l.product_id and o.lot_no = l.lot_no));
  if dup is not null then raise exception 'Lot numbers must be unique per product: % already reported.', dup; end if;
  perform set_config('app.production_engine', 'on', true);
  update public.production_reports set status = 'submitted', submitted_at = now(), submitted_by = auth.uid() where id = p_id;
  perform set_config('app.production_engine', 'off', true);
  perform public.emit_event('production.reported', 'production_reports', p_id::text,
    jsonb_build_object('number', r.number, 'date', r.report_date, 'location_id', r.location_id));
end $$;
revoke execute on function public.production_report_before_write, public.production_line_before_write from public, anon, authenticated;
revoke execute on function public.submit_production_report from public, anon;
grant execute on function public.submit_production_report to authenticated;

-- ================================================================ RLS
alter table public.production_reports enable row level security;
alter table public.production_report_lines enable row level security;

create or replace function public.can_view_production_report(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.production_reports r where r.id = p_id and (
    r.created_by = auth.uid() or public.has_permission('production.view') or public.can_read_all()))
$$;
create or replace function public.can_attach_production_report(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.production_reports r where r.id = p_id and r.created_by = auth.uid())
$$;
revoke execute on function public.can_view_production_report, public.can_attach_production_report from public, anon;
grant execute on function public.can_view_production_report, public.can_attach_production_report to authenticated;
insert into public.attachment_sources (record_table, can_view_function, can_attach_function)
values ('production_reports', 'can_view_production_report', 'can_attach_production_report')
on conflict do nothing;

create policy "production_reports: read" on public.production_reports for select to authenticated
  using (created_by = auth.uid() or public.can_view_production_report(id));
create policy "production_reports: add" on public.production_reports for insert to authenticated
  with check (created_by = auth.uid() and public.has_permission('production.report'));
create policy "production_reports: edit own draft" on public.production_reports for update to authenticated
  using (created_by = auth.uid() and status = 'draft') with check (created_by = auth.uid());
create policy "production_reports: delete own draft" on public.production_reports for delete to authenticated
  using (created_by = auth.uid() and status = 'draft');
create policy "production lines: read" on public.production_report_lines for select to authenticated
  using (public.can_view_production_report(report_id));
create policy "production lines: edit own draft" on public.production_report_lines for all to authenticated
  using (exists (select 1 from public.production_reports r where r.id = report_id and r.created_by = auth.uid() and r.status = 'draft'))
  with check (exists (select 1 from public.production_reports r where r.id = report_id and r.created_by = auth.uid() and r.status = 'draft'));

-- ================================================================ audit
select public.enable_audit('production_reports', false, array['updated_at']);
select public.enable_audit('production_report_lines');
