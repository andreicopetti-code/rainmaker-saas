-- Usage tracking + onboarding completo para novos usuários
DO $$ BEGIN
  CREATE TYPE public.usage_kind AS ENUM ('cnpj_detail', 'ai_request', 'email_send');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.usage_kind NOT NULL,
  period_key text NOT NULL,
  count int NOT NULL DEFAULT 0,
  UNIQUE (organization_id, kind, period_key)
);

CREATE TABLE IF NOT EXISTS public.ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_tokens int,
  completion_tokens int,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cnpj_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnpj_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_select" ON public.usage_counters;
CREATE POLICY "usage_select" ON public.usage_counters
  FOR SELECT USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "ai_select" ON public.ai_requests;
CREATE POLICY "ai_select" ON public.ai_requests
  FOR SELECT USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "cnpj_queries_select" ON public.cnpj_queries;
CREATE POLICY "cnpj_queries_select" ON public.cnpj_queries
  FOR SELECT USING (is_member_of(organization_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id uuid;
  new_slug text;
  default_plan_id uuid;
  user_name text;
BEGIN
  user_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    'Minha Empresa'
  );

  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, user_name)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO default_plan_id FROM plans ORDER BY created_at NULLS LAST LIMIT 1;
  new_slug := 'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  INSERT INTO organizations (name, slug, plan_id, subscription_status, trial_ends_at)
  VALUES (user_name, new_slug, default_plan_id, 'trial', now() + interval '14 days')
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (organization_id, user_id, role, is_active, accepted_at)
  VALUES (new_org_id, NEW.id, 'admin', true, now());

  INSERT INTO funnels (organization_id, name, stages, currency, created_by)
  VALUES (
    new_org_id,
    'Funil Principal',
    ARRAY['Leads','Qualificado','Reunião','Proposta','Negociação','Ganho','Perdido'],
    'BRL',
    NEW.id
  );

  RETURN NEW;
END;
$$;
