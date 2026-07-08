-- Plano Free sempre tem acesso ao app (pós-cancelamento ou cadastro)

CREATE OR REPLACE FUNCTION public.get_billing_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_status subscription_status;
  v_trial_ends timestamptz;
  v_plan_slug text;
BEGIN
  SELECT o.subscription_status, o.trial_ends_at, p.features->>'slug'
  INTO v_status, v_trial_ends, v_plan_slug
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  LEFT JOIN plans p ON p.id = o.plan_id
  WHERE om.user_id = p_user_id
    AND om.is_active = true
    AND om.accepted_at IS NOT NULL
  ORDER BY om.accepted_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_access', true, 'block_reason', null);
  END IF;

  IF v_plan_slug = 'free' THEN
    RETURN jsonb_build_object('has_access', true, 'block_reason', null);
  END IF;

  IF v_status IN ('active', 'past_due') THEN
    RETURN jsonb_build_object('has_access', true, 'block_reason', null);
  END IF;

  IF v_status = 'trial' THEN
    IF v_trial_ends IS NULL OR v_trial_ends > now() THEN
      RETURN jsonb_build_object('has_access', true, 'block_reason', null);
    END IF;
    RETURN jsonb_build_object(
      'has_access', false,
      'block_reason', 'Seu trial de 14 dias expirou. Assine para continuar usando o CEO Brain.'
    );
  END IF;

  RETURN jsonb_build_object(
    'has_access', false,
    'block_reason', 'Assinatura cancelada. Renove para voltar a usar o CEO Brain.'
  );
END;
$$;
