-- Metas de receita (mensal / anual) por organização.
-- Usadas no dashboard e (futuramente/agora) pelo chip "Meta do mês" do RM IA.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS goal_monthly numeric(15,2),
  ADD COLUMN IF NOT EXISTS goal_annual numeric(15,2);

COMMENT ON COLUMN public.organizations.goal_monthly IS
  'Meta de receita fechada (negócios ganhos) no mês calendário atual. Null = não definida.';

COMMENT ON COLUMN public.organizations.goal_annual IS
  'Meta de receita fechada (negócios ganhos) no ano calendário atual. Null = não definida.';
