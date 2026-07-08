-- RLS em plans (leitura pública para pricing)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_read_authenticated" ON public.plans;
CREATE POLICY "plans_read_authenticated" ON public.plans
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "plans_read_anon" ON public.plans;
CREATE POLICY "plans_read_anon" ON public.plans
  FOR SELECT TO anon USING (true);
