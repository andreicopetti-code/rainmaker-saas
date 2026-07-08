-- Lixeira do funil: listar, restaurar e apagar definitivamente deals soft-deleted

CREATE OR REPLACE FUNCTION public.list_trashed_opportunities(p_funnel_id uuid, p_org_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  stage text,
  deleted_at timestamptz,
  owner_id uuid,
  owner_name text,
  contact_company text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  DELETE FROM appointments a
  USING opportunities o
  WHERE a.opportunity_id = o.id
    AND o.funnel_id = p_funnel_id
    AND o.organization_id = p_org_id
    AND o.deleted_at IS NOT NULL
    AND o.deleted_at < now() - interval '30 days';

  DELETE FROM opportunities o
  WHERE o.funnel_id = p_funnel_id
    AND o.organization_id = p_org_id
    AND o.deleted_at IS NOT NULL
    AND o.deleted_at < now() - interval '30 days';

  RETURN QUERY
  SELECT
    o.id,
    o.title::text,
    o.stage::text,
    o.deleted_at::timestamptz,
    o.owner_id,
    p.full_name::text,
    c.company::text
  FROM opportunities o
  LEFT JOIN profiles p ON p.id = o.owner_id
  LEFT JOIN contacts c ON c.id = o.contact_id
  WHERE o.funnel_id = p_funnel_id
    AND o.organization_id = p_org_id
    AND o.deleted_at IS NOT NULL
    AND o.deleted_at >= now() - interval '30 days'
    AND (is_admin_of(p_org_id) OR o.owner_id = auth.uid())
  ORDER BY o.deleted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_opportunity(p_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    is_member_of(p_org_id)
    AND EXISTS (
      SELECT 1 FROM opportunities
      WHERE id = p_id
        AND organization_id = p_org_id
        AND deleted_at IS NOT NULL
        AND (owner_id = auth.uid() OR is_admin_of(p_org_id))
    )
  ) THEN
    RAISE EXCEPTION 'Não autorizado a restaurar este deal';
  END IF;

  UPDATE opportunities
  SET deleted_at = NULL, updated_at = now()
  WHERE id = p_id AND organization_id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_opportunity(p_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    is_member_of(p_org_id)
    AND EXISTS (
      SELECT 1 FROM opportunities
      WHERE id = p_id
        AND organization_id = p_org_id
        AND deleted_at IS NOT NULL
        AND (owner_id = auth.uid() OR is_admin_of(p_org_id))
    )
  ) THEN
    RAISE EXCEPTION 'Não autorizado a apagar este deal';
  END IF;

  DELETE FROM appointments
  WHERE opportunity_id = p_id AND organization_id = p_org_id;

  DELETE FROM opportunities
  WHERE id = p_id AND organization_id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.empty_opportunity_trash(p_funnel_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_member_of(p_org_id) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  DELETE FROM appointments a
  USING opportunities o
  WHERE a.opportunity_id = o.id
    AND o.funnel_id = p_funnel_id
    AND o.organization_id = p_org_id
    AND o.deleted_at IS NOT NULL
    AND (is_admin_of(p_org_id) OR o.owner_id = auth.uid());

  DELETE FROM opportunities o
  WHERE o.funnel_id = p_funnel_id
    AND o.organization_id = p_org_id
    AND o.deleted_at IS NOT NULL
    AND (is_admin_of(p_org_id) OR o.owner_id = auth.uid());
END;
$$;
