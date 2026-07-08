-- Personalização de etapas do funil (cores, ordem, ocultar, etc.)
ALTER TABLE funnels ADD COLUMN IF NOT EXISTS stage_config jsonb;

-- Backfill a partir de stages[] existente (id = label para compatibilidade legada)
UPDATE funnels
SET stage_config = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s,
      'label', s,
      'color', CASE (ord - 1) % 7
        WHEN 0 THEN '#2563EB'
        WHEN 1 THEN '#D97706'
        WHEN 2 THEN '#7C3AED'
        WHEN 3 THEN '#0891B2'
        WHEN 4 THEN '#EA580C'
        WHEN 5 THEN '#16A34A'
        ELSE '#DC2626'
      END,
      'bg', CASE (ord - 1) % 7
        WHEN 0 THEN '#EFF6FF'
        WHEN 1 THEN '#FFFBEB'
        WHEN 2 THEN '#F5F3FF'
        WHEN 3 THEN '#ECFEFF'
        WHEN 4 THEN '#FFF7ED'
        WHEN 5 THEN '#F0FDF4'
        ELSE '#FEF2F2'
      END,
      'text', CASE (ord - 1) % 7
        WHEN 0 THEN '#1D4ED8'
        WHEN 1 THEN '#92400E'
        WHEN 2 THEN '#5B21B6'
        WHEN 3 THEN '#0E7490'
        WHEN 4 THEN '#9A3412'
        WHEN 5 THEN '#15803D'
        ELSE '#B91C1C'
      END,
      'prob', CASE (ord - 1) % 7
        WHEN 0 THEN 10
        WHEN 1 THEN 25
        WHEN 2 THEN 45
        WHEN 3 THEN 65
        WHEN 4 THEN 80
        WHEN 5 THEN 100
        ELSE 0
      END,
      'hidden', false
    )
  )
  FROM unnest(stages) WITH ORDINALITY AS t(s, ord)
)
WHERE stage_config IS NULL AND stages IS NOT NULL AND array_length(stages, 1) > 0;
