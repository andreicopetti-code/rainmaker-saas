-- 007: trigger de onboarding (novo usuário → org + trial + org_data)

create or replace function public.default_org_data()
returns jsonb
language sql
immutable
as $$
  select '{
    "cards": [],
    "columns": [],
    "agenda_events": [],
    "vendors": [],
    "goals": {},
    "automations": [],
    "automations_log": []
  }'::jsonb;
$$;

create or replace function public.default_subscription_limits()
returns jsonb
language sql
immutable
as $$
  select '{
    "max_deals": 30,
    "max_members": 1,
    "cnpj_monthly": 5,
    "ai_monthly": 10,
    "automations_enabled": false
  }'::jsonb;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  -- Evita duplicar org se trigger rodar duas vezes
  if exists (
    select 1 from public.organization_members where user_id = new.id
  ) then
    return new;
  end if;

  org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    'Minha Empresa'
  );

  insert into public.organizations (name, owner_id)
  values (org_name, new.id)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'admin');

  insert into public.subscriptions (
    organization_id, plan, status, trial_ends_at, limits
  )
  values (
    new_org_id,
    'free',
    'trialing',
    now() + interval '14 days',
    public.default_subscription_limits()
  );

  insert into public.org_data (organization_id, data)
  values (new_org_id, public.default_org_data());

  insert into public.user_data (user_id, organization_id, data)
  values (new.id, new_org_id, public.default_org_data())
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        data = excluded.data,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
