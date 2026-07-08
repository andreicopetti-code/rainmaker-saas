-- Prefer team org (more members) when user belongs to multiple organizations

CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id uuid)
RETURNS TABLE(organization_id uuid, role user_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT om.organization_id, om.role
  FROM public.organization_members om
  WHERE om.user_id = p_user_id
    AND om.is_active = true
    AND om.accepted_at IS NOT NULL
  ORDER BY (
    SELECT count(*)::int
    FROM public.organization_members om2
    WHERE om2.organization_id = om.organization_id
      AND om2.is_active = true
      AND om2.accepted_at IS NOT NULL
  ) DESC,
  om.accepted_at DESC
  LIMIT 1;
$$;
