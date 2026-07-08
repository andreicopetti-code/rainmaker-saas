-- 001: extensões e enums
create extension if not exists "pgcrypto";

do $$ begin
  create type public.subscription_plan as enum ('free', 'pro', 'team');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_role as enum ('admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.usage_kind as enum ('cnpj_detail', 'ai_request', 'email_send');
exception when duplicate_object then null;
end $$;
