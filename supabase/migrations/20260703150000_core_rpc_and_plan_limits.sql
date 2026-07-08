-- RPCs críticos ausentes + consumo de ficha CNPJ baseado no plano da organização

-- ── Soft delete de deals (contorna conflito RLS no UPDATE) ────────────────────

CREATE OR REPLACE FUNCTION public.soft_delete_opportunity(p_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT (
    is_member_of(p_org_id)
    AND EXISTS (
      SELECT 1 FROM public.opportunities
      WHERE id = p_id
        AND organization_id = p_org_id
        AND deleted_at IS NULL
        AND (owner_id = auth.uid() OR is_admin_of(p_org_id))
    )
  ) THEN
    RAISE EXCEPTION 'Não autorizado a excluir este deal';
  END IF;

  UPDATE public.opportunities
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_id AND organization_id = p_org_id;
END;
$$;

-- ── Contador de uso (IA, e-mails) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_usage_counter(
  p_org_id uuid,
  p_kind public.usage_kind,
  p_period_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  INSERT INTO public.usage_counters (organization_id, kind, period_key, count)
  VALUES (p_org_id, p_kind, p_period_key, 1)
  ON CONFLICT (organization_id, kind, period_key)
  DO UPDATE SET count = public.usage_counters.count + 1;
END;
$$;

-- ── Ficha CNPJ: limites lidos de plans.features ───────────────────────────────

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

CREATE OR REPLACE FUNCTION public._cnpj_ficha_used(
  p_org_id uuid,
  p_period_kind text
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT count(*)::int
  FROM public.cnpj_queries cq
  WHERE cq.organization_id = p_org_id
    AND (
      (p_period_kind = 'daily'
        AND (cq.created_at AT TIME ZONE 'America/Sao_Paulo')::date
            = (timezone('America/Sao_Paulo', now()))::date)
      OR (p_period_kind = 'monthly'
        AND to_char(cq.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
            = to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM'))
    );
$$;

CREATE OR REPLACE FUNCTION public._cnpj_already_queried(
  p_org_id uuid,
  p_cnpj text,
  p_period_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cnpj_queries cq
    WHERE cq.organization_id = p_org_id
      AND cq.cnpj = p_cnpj
      AND (
        (p_period_kind = 'daily'
          AND (cq.created_at AT TIME ZONE 'America/Sao_Paulo')::date
              = (timezone('America/Sao_Paulo', now()))::date)
        OR (p_period_kind = 'monthly'
          AND to_char(cq.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
              = to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_cnpj_daily_usage(
  p_org_id uuid,
  p_date text DEFAULT NULL,
  p_daily_limit int DEFAULT NULL
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
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT c.period_key, c.ficha_limit, c.period_kind
  INTO v_period_key, v_limit, v_kind
  FROM public._org_ficha_config(p_org_id) c;

  v_used := public._cnpj_ficha_used(p_org_id, v_kind);

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used),
    'period_kind', v_kind
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_cnpj_credit(
  p_org_id uuid,
  p_date text,
  p_cnpj text,
  p_daily_limit int DEFAULT NULL
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
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT c.period_key, c.ficha_limit, c.period_kind
  INTO v_period_key, v_limit, v_kind
  FROM public._org_ficha_config(p_org_id) c;

  v_used := public._cnpj_ficha_used(p_org_id, v_kind);

  IF public._cnpj_already_queried(p_org_id, p_cnpj, v_kind) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_used),
      'reused', true
    );
  END IF;

  IF v_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reason', 'no_ficha_quota'
    );
  END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reason', 'limit_reached'
    );
  END IF;

  INSERT INTO public.cnpj_queries (organization_id, user_id, cnpj)
  VALUES (p_org_id, v_user_id, p_cnpj);

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
