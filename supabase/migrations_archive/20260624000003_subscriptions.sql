-- 003: assinaturas

create table if not exists public.subscriptions (
  organization_id          uuid primary key references public.organizations(id) on delete cascade,
  plan                     public.subscription_plan not null default 'free',
  status                   public.subscription_status not null default 'trialing',
  seats                    int not null default 1,
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  limits                   jsonb not null default '{
    "max_deals": 30,
    "max_members": 1,
    "cnpj_monthly": 5,
    "ai_monthly": 10,
    "automations_enabled": false
  }'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on column public.subscriptions.limits is
  'Limites por plano. free/pro/team atualizados via webhook ou Edge Function.';
