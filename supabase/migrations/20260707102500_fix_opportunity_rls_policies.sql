-- Remove política legada que expunha todos os deals a qualquer membro da org.

DROP POLICY IF EXISTS "Membros veem oportunidades da sua org" ON public.opportunities;

-- Garante política única de leitura (admin vê tudo; membro só owner_id = self).
DROP POLICY IF EXISTS "opportunities_select" ON public.opportunities;
CREATE POLICY "opportunities_select" ON public.opportunities
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(organization_id)
    AND (public.is_admin_of(organization_id) OR owner_id = auth.uid())
  );
