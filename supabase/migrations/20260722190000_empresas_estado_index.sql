-- Acelera contagem/filtro por UF na base de empresas.
CREATE INDEX IF NOT EXISTS idx_empresas_estado ON public.empresas (estado);
