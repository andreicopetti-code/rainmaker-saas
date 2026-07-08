-- Corrige "structure of query does not match function result type"
-- Causa: colunas varchar/timestamp do schema legado ≠ tipos declarados no RETURNS TABLE.

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
SET search_path TO public
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
