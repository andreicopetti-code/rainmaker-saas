-- Visibilidade de negócios: admin vê toda a equipe; membro só os próprios (owner_id).

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunities_select" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_select_org" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_select_member" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_insert" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_insert_member" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_update" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_update_member" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_delete" ON public.opportunities;

CREATE POLICY "opportunities_select" ON public.opportunities
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(organization_id)
    AND (public.is_admin_of(organization_id) OR owner_id = auth.uid())
  );

CREATE POLICY "opportunities_insert" ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member_of(organization_id)
    AND (public.is_admin_of(organization_id) OR owner_id = auth.uid())
  );

CREATE POLICY "opportunities_update" ON public.opportunities
  FOR UPDATE TO authenticated
  USING (
    public.is_member_of(organization_id)
    AND (public.is_admin_of(organization_id) OR owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_member_of(organization_id)
    AND (public.is_admin_of(organization_id) OR owner_id = auth.uid())
  );
