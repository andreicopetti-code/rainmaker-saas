-- Matriz de planos CEO Brain (Free + 3 pagos)
-- features.slug é a chave estável para checkout e limites.

INSERT INTO public.plans (name, price_monthly, price_annual, features)
SELECT 'Free', 0, 0, '{
  "slug": "free",
  "max_deals": 30,
  "max_members": 1,
  "ai_monthly": 30,
  "ficha_monthly": 3,
  "ficha_daily": null,
  "allowed_ufs": 0,
  "emails_enabled": false,
  "ceo_brain_enabled": true,
  "import_enabled": true
}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.plans WHERE features->>'slug' = 'free'
);

UPDATE public.plans
SET
  name = 'Regional 1',
  price_monthly = 99,
  price_annual = 990,
  features = '{
    "slug": "regional_1",
    "max_deals": 500,
    "max_members": 3,
    "ai_monthly": 200,
    "ficha_monthly": null,
    "ficha_daily": 20,
    "allowed_ufs": 1,
    "emails_enabled": true,
    "ceo_brain_enabled": true,
    "import_enabled": true
  }'::jsonb,
  updated_at = now()
WHERE name = 'CEO Brain'
   OR features->>'slug' = 'regional_1'
   OR (features->>'slug' IS NULL AND price_monthly = 99);

INSERT INTO public.plans (name, price_monthly, price_annual, features)
SELECT 'Regional 1', 99, 990, '{
  "slug": "regional_1",
  "max_deals": 500,
  "max_members": 3,
  "ai_monthly": 200,
  "ficha_monthly": null,
  "ficha_daily": 20,
  "allowed_ufs": 1,
  "emails_enabled": true,
  "ceo_brain_enabled": true,
  "import_enabled": true
}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.plans WHERE features->>'slug' = 'regional_1'
);

INSERT INTO public.plans (name, price_monthly, price_annual, features)
SELECT 'Regional 3', 249, 2490, '{
  "slug": "regional_3",
  "max_deals": 2000,
  "max_members": 8,
  "ai_monthly": 500,
  "ficha_monthly": null,
  "ficha_daily": 50,
  "allowed_ufs": 3,
  "emails_enabled": true,
  "ceo_brain_enabled": true,
  "import_enabled": true
}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.plans WHERE features->>'slug' = 'regional_3'
);

INSERT INTO public.plans (name, price_monthly, price_annual, features)
SELECT 'Nacional', 399, 3990, '{
  "slug": "nacional",
  "max_deals": 99999,
  "max_members": 15,
  "ai_monthly": 1000,
  "ficha_monthly": null,
  "ficha_daily": 80,
  "allowed_ufs": 27,
  "emails_enabled": true,
  "ceo_brain_enabled": true,
  "import_enabled": true
}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.plans WHERE features->>'slug' = 'nacional'
);

-- Trial de novos usuários: plano Regional 1 (mantém criação de funil)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id uuid;
  new_slug text;
  default_plan_id uuid;
  user_name text;
BEGIN
  user_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    'Minha Empresa'
  );

  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, user_name)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO default_plan_id
  FROM plans
  WHERE features->>'slug' = 'regional_1'
  ORDER BY created_at NULLS LAST
  LIMIT 1;

  IF default_plan_id IS NULL THEN
    SELECT id INTO default_plan_id FROM plans ORDER BY created_at NULLS LAST LIMIT 1;
  END IF;

  new_slug := 'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  INSERT INTO organizations (name, slug, plan_id, subscription_status, trial_ends_at)
  VALUES (user_name, new_slug, default_plan_id, 'trial', now() + interval '14 days')
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (organization_id, user_id, role, is_active, accepted_at)
  VALUES (new_org_id, NEW.id, 'admin', true, now());

  INSERT INTO funnels (organization_id, name, stages, currency, created_by)
  VALUES (
    new_org_id,
    'Funil Principal',
    ARRAY['Leads','Qualificado','Reunião','Proposta','Negociação','Ganho','Perdido'],
    'BRL',
    NEW.id
  );

  RETURN NEW;
END;
$$;
