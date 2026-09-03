-- Índice por UF (arquivo local antigo não estava aplicado no prod).
CREATE INDEX IF NOT EXISTS idx_empresas_estado ON public.empresas (estado);

-- Contagem com timeout maior que o padrão do role authenticated (8s),
-- que fazia o COUNT(*) falhar e a UI cair no fallback antigo RS+SE = 475.016.
CREATE OR REPLACE FUNCTION public.count_empresas(p_ufs text[] DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout TO '60s'
AS $$
  SELECT CASE
    WHEN p_ufs IS NULL THEN (
      -- Contagem nacional: estimativa do planner (rápida). Rodar ANALYZE após imports.
      SELECT GREATEST(c.reltuples::bigint, 0)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'empresas'
    )
    ELSE (
      SELECT COUNT(*)::bigint
      FROM public.empresas e
      WHERE e.estado = ANY (p_ufs)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.count_empresas(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_empresas(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_empresas(text[]) TO service_role;

-- Alivia COUNT filtrado por UF via PostgREST (padrão authenticated era 8s).
ALTER ROLE authenticated SET statement_timeout = '30s';
NOTIFY pgrst, 'reload config';

ANALYZE public.empresas;
