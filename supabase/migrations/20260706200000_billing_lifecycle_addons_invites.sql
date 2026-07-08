-- Billing lifecycle: downgrade Free, add-ons, convites com max_members

-- ── Add-on state per org ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_addon_state (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  extra_uf_slots int NOT NULL DEFAULT 0 CHECK (extra_uf_slots >= 0),
  ficha_credit_balance int NOT NULL DEFAULT 0 CHECK (ficha_credit_balance >= 0),
  uf_extra_stripe_subscription_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_addon_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addon_state_select" ON public.organization_addon_state;
CREATE POLICY "addon_state_select" ON public.organization_addon_state
  FOR SELECT USING (is_member_of(organization_id));

-- Stripe price IDs for add-ons (populated by npm run billing:setup)
CREATE TABLE IF NOT EXISTS public.billing_addon_prices (
  slug text PRIMARY KEY,
  stripe_price_id text NOT NULL,
  billing text NOT NULL CHECK (billing IN ('recurring', 'one_time')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_addon_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_addon_prices_read" ON public.billing_addon_prices;
CREATE POLICY "billing_addon_prices_read" ON public.billing_addon_prices
  FOR SELECT USING (true);

-- ── Invite tokens ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_org
  ON public.invite_tokens (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_active
  ON public.invite_tokens (token) WHERE used = false;

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_admin" ON public.invite_tokens;
CREATE POLICY "invites_admin" ON public.invite_tokens
  FOR ALL USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.is_active = true
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.is_active = true
    )
  );

-- ── Helpers: members / plan limits ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.org_active_member_count(p_org_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT count(*)::int
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND is_active = true
    AND accepted_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_org_member_limit(p_org_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(NULLIF(p.features->>'max_members', '')::int, 1)
  FROM public.organizations o
  LEFT JOIN public.plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;
$$;

CREATE OR REPLACE FUNCTION public.org_extra_uf_slots(p_org_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT extra_uf_slots FROM public.organization_addon_state WHERE organization_id = p_org_id
  ), 0);
$$;

-- ── Ficha config: plan limit + pack credits as bonus on monthly free only ────
-- Daily paid plans use pack credits via consume_cnpj_credit fallback.

CREATE OR REPLACE FUNCTION public._org_ficha_config(p_org_id uuid)
RETURNS TABLE(period_key text, ficha_limit int, period_kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_features jsonb;
  v_daily int;
  v_monthly int;
BEGIN
  SELECT p.features INTO v_features
  FROM public.organizations o
  LEFT JOIN public.plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;

  IF v_features IS NULL THEN
    v_features := '{"ficha_monthly": 3, "ficha_daily": null}'::jsonb;
  END IF;

  v_daily := NULLIF(v_features->>'ficha_daily', '')::int;
  v_monthly := NULLIF(v_features->>'ficha_monthly', '')::int;

  IF v_daily IS NOT NULL THEN
    period_key := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM-DD');
    ficha_limit := v_daily;
    period_kind := 'daily';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_monthly IS NOT NULL THEN
    period_key := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
    ficha_limit := v_monthly;
    period_kind := 'monthly';
    RETURN NEXT;
    RETURN;
  END IF;

  period_key := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  ficha_limit := 0;
  period_kind := 'monthly';
  RETURN NEXT;
END;
$$;

-- ── consume_cnpj_credit: use pack balance when daily plan quota exhausted ────

CREATE OR REPLACE FUNCTION public.consume_cnpj_credit(
  p_org_id uuid,
  p_date text,
  p_cnpj text,
  p_daily_limit int DEFAULT NULL,
  p_razao_social text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_period_key text;
  v_limit int;
  v_kind text;
  v_used int;
  v_user_id uuid;
  v_name text;
  v_credit_balance int;
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_name := NULLIF(trim(p_razao_social), '');

  SELECT c.period_key, c.ficha_limit, c.period_kind
  INTO v_period_key, v_limit, v_kind
  FROM public._org_ficha_config(p_org_id) c;

  v_used := public._cnpj_ficha_used(p_org_id, v_kind);

  SELECT COALESCE(ficha_credit_balance, 0)
  INTO v_credit_balance
  FROM public.organization_addon_state
  WHERE organization_id = p_org_id;

  IF v_credit_balance IS NULL THEN
    v_credit_balance := 0;
  END IF;

  IF public._cnpj_already_queried(p_org_id, p_cnpj, v_kind) THEN
    IF v_name IS NOT NULL THEN
      UPDATE public.cnpj_queries
      SET razao_social = v_name
      WHERE organization_id = p_org_id
        AND cnpj = p_cnpj
        AND (razao_social IS NULL OR trim(razao_social) = '')
        AND (
          (v_kind = 'daily'
            AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
                = (timezone('America/Sao_Paulo', now()))::date)
          OR (v_kind = 'monthly'
            AND to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
                = to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM'))
        );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_used),
      'reused', true
    );
  END IF;

  IF v_limit <= 0 AND v_credit_balance <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reason', 'no_ficha_quota'
    );
  END IF;

  IF v_used >= v_limit AND v_credit_balance <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reason', 'limit_reached'
    );
  END IF;

  INSERT INTO public.cnpj_queries (organization_id, user_id, cnpj, razao_social)
  VALUES (p_org_id, v_user_id, p_cnpj, v_name);

  IF v_used >= v_limit AND v_credit_balance > 0 THEN
    UPDATE public.organization_addon_state
    SET ficha_credit_balance = ficha_credit_balance - 1,
        updated_at = now()
    WHERE organization_id = p_org_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', v_limit,
      'remaining', v_credit_balance - 1,
      'reused', false,
      'from_pack', true
    );
  END IF;

  v_used := v_used + 1;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used),
    'reused', false
  );
END;
$$;
