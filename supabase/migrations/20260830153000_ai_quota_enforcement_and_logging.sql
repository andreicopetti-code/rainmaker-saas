-- Cota de IA atômica + policy INSERT em ai_requests

CREATE OR REPLACE FUNCTION public._org_ai_config(p_org_id uuid)
RETURNS TABLE(ai_limit int, ceo_brain_enabled boolean, period_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_features jsonb;
BEGIN
  SELECT p.features INTO v_features
  FROM public.organizations o
  LEFT JOIN public.plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;

  IF v_features IS NULL THEN
    v_features := '{"ai_monthly": 30, "ceo_brain_enabled": true}'::jsonb;
  END IF;

  ai_limit := NULLIF(v_features->>'ai_monthly', '')::int;
  ceo_brain_enabled := COALESCE((v_features->>'ceo_brain_enabled')::boolean, true);
  period_key := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_request(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_limit int;
  v_enabled boolean;
  v_period_key text;
  v_new_count int;
  v_current int;
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT c.ai_limit, c.ceo_brain_enabled, c.period_key
  INTO v_limit, v_enabled, v_period_key
  FROM public._org_ai_config(p_org_id) c;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', COALESCE(v_limit, 0),
      'remaining', 0,
      'reason', 'feature_disabled'
    );
  END IF;

  IF v_limit IS NULL OR v_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', COALESCE(v_limit, 0),
      'remaining', 0,
      'reason', 'no_ai_quota'
    );
  END IF;

  INSERT INTO public.usage_counters (organization_id, kind, period_key, count)
  VALUES (p_org_id, 'ai_request', v_period_key, 0)
  ON CONFLICT (organization_id, kind, period_key) DO NOTHING;

  UPDATE public.usage_counters
  SET count = count + 1
  WHERE organization_id = p_org_id
    AND kind = 'ai_request'
    AND period_key = v_period_key
    AND count < v_limit
  RETURNING count INTO v_new_count;

  IF v_new_count IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_new_count,
      'limit', v_limit,
      'remaining', GREATEST(0, v_limit - v_new_count)
    );
  END IF;

  SELECT count INTO v_current
  FROM public.usage_counters
  WHERE organization_id = p_org_id
    AND kind = 'ai_request'
    AND period_key = v_period_key;

  RETURN jsonb_build_object(
    'allowed', false,
    'used', COALESCE(v_current, v_limit),
    'limit', v_limit,
    'remaining', 0,
    'reason', 'limit_reached'
  );
END;
$$;

DROP POLICY IF EXISTS "ai_insert" ON public.ai_requests;
CREATE POLICY "ai_insert" ON public.ai_requests
  FOR INSERT
  WITH CHECK (
    is_member_of(organization_id)
    AND user_id = auth.uid()
  );
