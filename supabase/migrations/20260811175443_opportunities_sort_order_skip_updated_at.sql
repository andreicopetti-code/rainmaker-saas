-- Reordering deals updates only sort_order for every card in the column.
-- Preserve updated_at in that case so the "days" badge does not reset for peers.
-- Real edits (stage, title, value, etc.) still bump updated_at via NOW().

CREATE OR REPLACE FUNCTION public.update_opportunities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.sort_order IS DISTINCT FROM OLD.sort_order
    AND (to_jsonb(NEW) - 'sort_order' - 'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'sort_order' - 'updated_at')
  ) THEN
    NEW.updated_at := OLD.updated_at;
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER trg_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_opportunities_updated_at();
