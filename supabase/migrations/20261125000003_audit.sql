-- Audit log for admin-editable tables. Written by trigger, readable by the owner only.

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec_id text;
  b jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  a jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  -- skip noise: profile updates that only touch activity timestamps
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (b - 'last_active_at' - 'updated_at') = (a - 'last_active_at' - 'updated_at') then
    return new;
  end if;

  rec_id := coalesce(a->>'id', b->>'id',
                     concat_ws(':', coalesce(a, b)->>'team_id', coalesce(a, b)->>'manager_id', coalesce(a, b)->>'level'));

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name, rec_id, b, a);

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['app_settings','branches','teams','team_managers','profiles','learning_paths','modules',
                           'lessons','lesson_assets','products','quizzes','questions','scenarios','rubrics','levels',
                           'badges','kpi_targets','field_kpis','level_signoffs','roleplay_scores','path_assignments',
                           'prehire_invites']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.write_audit()', t);
  end loop;
end $$;
