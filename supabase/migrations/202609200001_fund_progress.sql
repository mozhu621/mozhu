create table if not exists public.fund_study_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision >= 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at bigint not null
);
alter table public.fund_study_progress enable row level security;
revoke all on public.fund_study_progress from public, anon, authenticated;
grant select on public.fund_study_progress to authenticated;
grant all on public.fund_study_progress to service_role;
create policy "read_own_fund_progress" on public.fund_study_progress
  for select to authenticated using ((select auth.uid()) = user_id);

-- Only the authenticated Edge Function may save, after validating and grading.
create or replace function public.save_fund_progress(
  p_user_id uuid, p_revision bigint, p_state jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.fund_study_progress;
  changed boolean;
begin
  if p_user_id is null or p_revision < 0 or jsonb_typeof(p_state) <> 'object'
     or octet_length(p_state::text) > 1500000 then
    raise exception 'invalid_progress';
  end if;
  if p_revision = 0 then
    insert into public.fund_study_progress (user_id, revision, state, updated_at)
    values (p_user_id, 1, p_state, floor(extract(epoch from clock_timestamp())*1000)::bigint)
    on conflict (user_id) do nothing returning * into saved;
  else
    update public.fund_study_progress
    set revision = revision + 1, state = p_state,
        updated_at = floor(extract(epoch from clock_timestamp())*1000)::bigint
    where user_id = p_user_id and revision = p_revision returning * into saved;
  end if;
  changed := found;
  if not changed then select * into saved from public.fund_study_progress where user_id = p_user_id; end if;
  return jsonb_build_object('conflict', not changed, 'row', to_jsonb(saved));
end;
$$;
revoke all on function public.save_fund_progress(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_fund_progress(uuid, bigint, jsonb) to service_role;
