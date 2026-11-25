-- Phase 1a: organization model.
-- Entities → locations → departments → positions → employees. Users link to an employee via profiles.employee_id.
-- Academy branches become locations; Academy teams stay as sales teams under a location.
-- RLS policies for these tables are in 20261201000003_rls_on_rbac.sql (they need the RBAC helpers).

create type public.location_type as enum ('office', 'plant', 'warehouse', 'pickup_hub', 'business_center');
create type public.employee_status as enum ('active', 'on_leave', 'inactive');

-- ---------------------------------------------------------------- entities
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  legal_name text not null default '',
  tin text not null default '',
  vat_registered boolean,
  address text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------- locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id),
  code text not null,
  name text not null,
  type public.location_type not null default 'office',
  holds_inventory boolean not null default false,
  is_pickup_point boolean not null default false,
  address text not null default '',
  city text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (entity_id, code),
  unique (entity_id, name),
  -- an office never holds stock
  constraint office_holds_no_inventory check (type <> 'office' or not holds_inventory)
);
create index on public.locations (entity_id);

-- ---------------------------------------------------------------- departments & positions
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id),
  code text not null,
  name text not null,
  parent_id uuid references public.departments(id) on delete set null,
  head_employee_id uuid, -- FK added below (employees doesn't exist yet)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (entity_id, code),
  unique (entity_id, name)
);
create index on public.departments (entity_id);
create index on public.departments (parent_id);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (department_id, title)
);
create index on public.positions (department_id);

-- ---------------------------------------------------------------- employees (basic profile; 201 file is Phase 9)
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id),
  employee_no text not null,
  full_name text not null,
  work_email text,
  phone text,
  position_id uuid references public.positions(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  supervisor_id uuid references public.employees(id) on delete set null,
  hire_date date,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (entity_id, employee_no),
  constraint not_own_supervisor check (supervisor_id is null or supervisor_id <> id)
);
create unique index employees_work_email_key on public.employees (lower(work_email)) where work_email is not null;
create index on public.employees (entity_id);
create index on public.employees (position_id);
create index on public.employees (department_id);
create index on public.employees (location_id);
create index on public.employees (supervisor_id);
create index on public.employees (status);

alter table public.departments
  add constraint departments_head_employee_fk foreign key (head_employee_id) references public.employees(id) on delete set null;
create index on public.departments (head_employee_id);

-- user ↔ employee (external users have none)
alter table public.profiles add column employee_id uuid unique references public.employees(id) on delete set null;

-- Supervisor chain must not loop (A → B → A).
create or replace function public.check_supervisor_cycle() returns trigger
language plpgsql set search_path = public as $$
declare
  cur uuid := new.supervisor_id;
  depth int := 0;
begin
  while cur is not null loop
    if cur = new.id then
      raise exception 'This supervisor would create a loop in the reporting line.';
    end if;
    depth := depth + 1;
    if depth > 50 then
      raise exception 'Reporting line is too deep (over 50 levels).';
    end if;
    select supervisor_id into cur from public.employees where id = cur;
  end loop;
  return new;
end $$;
create trigger check_supervisor_cycle before insert or update of supervisor_id on public.employees
  for each row execute function public.check_supervisor_cycle();
revoke execute on function public.check_supervisor_cycle() from public, anon, authenticated;

-- ---------------------------------------------------------------- seed the single entity
insert into public.entities (code, name, legal_name)
values ('JDF', 'JD Foods', 'JD Foods')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- branches → locations
alter table public.teams add column location_id uuid references public.locations(id) on delete set null;
alter table public.teams add column department_id uuid references public.departments(id) on delete set null;
create index on public.teams (location_id);
create index on public.teams (department_id);

insert into public.locations (entity_id, code, name, type)
select e.id, upper(left(regexp_replace(b.name, '[^A-Za-z0-9]', '', 'g'), 8)) || '-' || left(b.id::text, 4), b.name, 'office'
from public.branches b cross join public.entities e
where e.code = 'JDF'
on conflict do nothing;

update public.teams t set location_id = l.id
from public.branches b, public.locations l
where t.branch_id = b.id and l.name = b.name;

alter table public.teams drop constraint if exists teams_branch_id_name_key;
alter table public.teams drop column branch_id;
alter table public.teams add constraint teams_name_key unique (name);
drop table public.branches;

-- ---------------------------------------------------------------- housekeeping
do $$
declare t text;
begin
  foreach t in array array['entities','locations','departments','positions','employees']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
