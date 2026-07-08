-- 002: organizações, membros e convites

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Minha Empresa',
  owner_id    uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.member_role not null default 'member',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.invite_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token           text not null unique,
  created_by      uuid not null references auth.users(id) on delete cascade,
  expires_at      timestamptz not null,
  used            boolean not null default false,
  used_by         uuid references auth.users(id),
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org  on public.organization_members(organization_id);
create index if not exists idx_invite_token     on public.invite_tokens(token) where used = false;

-- Compatibilidade com ceo_brain.html (user_data legado)
create table if not exists public.user_data (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  data            jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.user_data
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.user_data
  add column if not exists updated_at timestamptz not null default now();
