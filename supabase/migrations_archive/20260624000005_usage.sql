-- 005: uso, IA e auditoria CNPJ

create table if not exists public.usage_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            public.usage_kind not null,
  period_key      text not null,
  count           int not null default 0,
  unique (organization_id, kind, period_key)
);

create index if not exists idx_usage_org_period
  on public.usage_counters(organization_id, period_key);

create table if not exists public.ai_requests (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  prompt_tokens     int,
  completion_tokens int,
  model             text,
  created_at        timestamptz not null default now()
);

create table if not exists public.cnpj_queries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  cnpj            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_cnpj_queries_org
  on public.cnpj_queries(organization_id, created_at desc);

-- Tabela empresas (CNPJ) — criar só se não existir no projeto legado
create table if not exists public.empresas (
  id    bigserial primary key,
  cnpj  text unique,
  data  jsonb
);

create index if not exists idx_empresas_cnpj on public.empresas(cnpj);
