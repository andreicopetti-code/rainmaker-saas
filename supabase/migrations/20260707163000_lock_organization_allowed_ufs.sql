-- UFs contratadas ficam fixas após a primeira seleção (evita rodízio entre estados).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS allowed_ufs_locked_at timestamptz;

COMMENT ON COLUMN public.organizations.allowed_ufs_locked_at IS
  'Quando preenchido, UFs já salvas em organization_allowed_ufs não podem ser removidas/trocadas; só é permitido incluir novas UFs até o limite do plano (+ add-ons).';

-- Organizações que já tinham UFs salvas passam a locked imediatamente.
UPDATE public.organizations o
SET allowed_ufs_locked_at = COALESCE(o.allowed_ufs_locked_at, now())
WHERE o.allowed_ufs_locked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_allowed_ufs u
    WHERE u.organization_id = o.id
  );
