-- UFs contratadas por organização (planos Regional 1 / Regional 3)

CREATE TABLE IF NOT EXISTS public.organization_allowed_ufs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uf char(2) NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, uf)
);

CREATE INDEX IF NOT EXISTS idx_organization_allowed_ufs_org
  ON public.organization_allowed_ufs (organization_id);

ALTER TABLE public.organization_allowed_ufs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_allowed_ufs_select ON public.organization_allowed_ufs;
CREATE POLICY organization_allowed_ufs_select
  ON public.organization_allowed_ufs
  FOR SELECT
  USING (public.is_member_of(organization_id));

DROP POLICY IF EXISTS organization_allowed_ufs_admin_all ON public.organization_allowed_ufs;
CREATE POLICY organization_allowed_ufs_admin_all
  ON public.organization_allowed_ufs
  FOR ALL
  USING (public.is_admin_of(organization_id))
  WITH CHECK (public.is_admin_of(organization_id));
