-- Persist company name on CNPJ ficha queries (history UI without joining empresas).

ALTER TABLE public.cnpj_queries
  ADD COLUMN IF NOT EXISTS razao_social text;

-- Backfill from empresas (normalize CNPJ digits on both sides).
UPDATE public.cnpj_queries cq
SET razao_social = COALESCE(
  NULLIF(trim(e.razao_social), ''),
  NULLIF(trim(e.nome_fantasia), '')
)
FROM public.empresas e
WHERE regexp_replace(cq.cnpj, '\D', '', 'g') = regexp_replace(e.cnpj, '\D', '', 'g')
  AND (cq.razao_social IS NULL OR trim(cq.razao_social) = '');

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

  INSERT INTO public.cnpj_queries (organization_id, user_id, cnpj, razao_social)
  VALUES (p_org_id, v_user_id, p_cnpj, v_name);

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
