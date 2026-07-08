-- 006: funções auxiliares e RLS

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_member_role()
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.organization_members om
  where om.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.org_has_active_subscription(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.organization_id = p_org_id
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
      and (s.trial_ends_at is null or s.trial_ends_at > now() or s.status = 'active')
  );
$$;

create or replace function public.check_and_increment_usage(
  p_org_id uuid,
  p_kind public.usage_kind,
  p_period_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
  v_limit int;
  v_count int;
  v_field text;
begin
  select limits into v_limits
  from public.subscriptions
  where organization_id = p_org_id
    and status in ('trialing', 'active');

  if v_limits is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_active_subscription');
  end if;

  v_field := case p_kind
    when 'cnpj_detail' then 'cnpj_monthly'
    when 'ai_request'  then 'ai_monthly'
    else 'ai_monthly'
  end;

  v_limit := coalesce((v_limits->>v_field)::int, 0);

  insert into public.usage_counters (organization_id, kind, period_key, count)
  values (p_org_id, p_kind, p_period_key, 0)
  on conflict (organization_id, kind, period_key) do nothing;

  select count into v_count
  from public.usage_counters
  where organization_id = p_org_id
    and kind = p_kind
    and period_key = p_period_key
  for update;

  if v_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'used', v_count,
      'limit', v_limit
    );
  end if;

  update public.usage_counters
  set count = count + 1
  where organization_id = p_org_id
    and kind = p_kind
    and period_key = p_period_key;

  return jsonb_build_object(
    'allowed', true,
    'used', v_count + 1,
    'limit', v_limit
  );
end;
$$;

-- RLS
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.invite_tokens        enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.org_data             enable row level security;
alter table public.user_data            enable row level security;
alter table public.usage_counters       enable row level security;
alter table public.ai_requests          enable row level security;
alter table public.cnpj_queries         enable row level security;

-- organizations
drop policy if exists "org_select_member" on public.organizations;
create policy "org_select_member" on public.organizations
  for select using (
    id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "org_update_admin" on public.organizations;
create policy "org_update_admin" on public.organizations
  for update using (
    id = public.current_org_id() and public.current_member_role() = 'admin'
  );

-- organization_members
drop policy if exists "members_select_same_org" on public.organization_members;
create policy "members_select_same_org" on public.organization_members
  for select using (organization_id = public.current_org_id());

drop policy if exists "members_insert_admin" on public.organization_members;
create policy "members_insert_admin" on public.organization_members
  for insert with check (
    organization_id = public.current_org_id()
    and public.current_member_role() = 'admin'
  );

drop policy if exists "members_update_admin" on public.organization_members;
create policy "members_update_admin" on public.organization_members
  for update using (
    organization_id = public.current_org_id()
    and public.current_member_role() = 'admin'
  );

drop policy if exists "members_delete_admin" on public.organization_members;
create policy "members_delete_admin" on public.organization_members
  for delete using (
    organization_id = public.current_org_id()
    and public.current_member_role() = 'admin'
  );

-- Permite usuário inserir a si mesmo ao aceitar convite (sem ser admin ainda)
drop policy if exists "members_insert_self_invite" on public.organization_members;
create policy "members_insert_self_invite" on public.organization_members
  for insert with check (user_id = auth.uid());

-- org_data
drop policy if exists "org_data_select" on public.org_data;
create policy "org_data_select" on public.org_data
  for select using (organization_id = public.current_org_id());

drop policy if exists "org_data_all_member" on public.org_data;
create policy "org_data_all_member" on public.org_data
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- user_data legado (usuário só acessa o próprio)
drop policy if exists "users manage own data" on public.user_data;
drop policy if exists "user_data_own" on public.user_data;
create policy "user_data_own" on public.user_data
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- subscriptions
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions
  for select using (organization_id = public.current_org_id());

-- usage / ai / cnpj
drop policy if exists "usage_select" on public.usage_counters;
create policy "usage_select" on public.usage_counters
  for select using (organization_id = public.current_org_id());

drop policy if exists "ai_select" on public.ai_requests;
create policy "ai_select" on public.ai_requests
  for select using (organization_id = public.current_org_id());

drop policy if exists "cnpj_queries_select" on public.cnpj_queries;
create policy "cnpj_queries_select" on public.cnpj_queries
  for select using (organization_id = public.current_org_id());

-- invite_tokens
drop policy if exists "invites_admin" on public.invite_tokens;
create policy "invites_admin" on public.invite_tokens
  for all using (
    organization_id = public.current_org_id()
    and public.current_member_role() = 'admin'
  );

-- empresas: leitura pública via anon (preview CNPJ) — ajuste conforme necessidade
alter table public.empresas enable row level security;
drop policy if exists "empresas_read_anon" on public.empresas;
create policy "empresas_read_anon" on public.empresas
  for select using (true);
