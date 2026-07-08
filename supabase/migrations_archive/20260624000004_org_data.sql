-- 004: dados do funil por organização (substitui blob user_data no SaaS)

create table if not exists public.org_data (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  data            jsonb not null default '{}'::jsonb,
  version         int not null default 1,
  updated_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);

comment on table public.org_data is
  'Blob JSON: cards, columns, agenda_events, vendors, goals, automations, automations_log';

-- Migração opcional: copiar user_data → org_data quando organization_id estiver preenchido
insert into public.org_data (organization_id, data, updated_at)
select ud.organization_id, ud.data, ud.updated_at
from public.user_data ud
where ud.organization_id is not null
on conflict (organization_id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at
  where public.org_data.updated_at <= excluded.updated_at;
