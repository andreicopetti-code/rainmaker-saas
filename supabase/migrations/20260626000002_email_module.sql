-- Módulo de e-mails: mensagens, templates e configuração de conta

DO $$ BEGIN
  CREATE TYPE public.email_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.email_folder AS ENUM ('inbox', 'sent', 'trash');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.email_provider AS ENUM ('none', 'gmail', 'emailjs', 'resend');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.email_send_status AS ENUM (
    'draft', 'sent', 'delivered', 'failed', 'received'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.email_account_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.email_provider NOT NULL DEFAULT 'none',
  from_email text,
  from_name text DEFAULT 'CEO Brain',
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_expires_at timestamptz,
  gmail_history_id text,
  emailjs_service_id text,
  emailjs_template_id text,
  emailjs_public_key text,
  last_sync_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  direction public.email_direction NOT NULL,
  folder public.email_folder NOT NULL DEFAULT 'inbox',
  from_address text NOT NULL DEFAULT '',
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  external_id text,
  thread_id text,
  in_reply_to uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  send_status public.email_send_status NOT NULL DEFAULT 'received',
  real_send boolean NOT NULL DEFAULT false,
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_org_external_uidx
  ON public.email_messages (organization_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS email_messages_org_folder_created_idx
  ON public.email_messages (organization_id, folder, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS email_messages_org_unread_idx
  ON public.email_messages (organization_id, is_read)
  WHERE deleted_at IS NULL AND direction = 'inbound' AND folder = 'inbox';

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_templates_org_idx
  ON public.email_templates (organization_id, sort_order);

ALTER TABLE public.email_account_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_settings_select" ON public.email_account_settings;
CREATE POLICY "email_settings_select" ON public.email_account_settings
  FOR SELECT USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_settings_insert" ON public.email_account_settings;
CREATE POLICY "email_settings_insert" ON public.email_account_settings
  FOR INSERT WITH CHECK (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_settings_update" ON public.email_account_settings;
CREATE POLICY "email_settings_update" ON public.email_account_settings
  FOR UPDATE USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_settings_delete" ON public.email_account_settings;
CREATE POLICY "email_settings_delete" ON public.email_account_settings
  FOR DELETE USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_messages_select" ON public.email_messages;
CREATE POLICY "email_messages_select" ON public.email_messages
  FOR SELECT USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_messages_insert" ON public.email_messages;
CREATE POLICY "email_messages_insert" ON public.email_messages
  FOR INSERT WITH CHECK (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_messages_update" ON public.email_messages;
CREATE POLICY "email_messages_update" ON public.email_messages
  FOR UPDATE USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_messages_delete" ON public.email_messages;
CREATE POLICY "email_messages_delete" ON public.email_messages
  FOR DELETE USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_templates_select" ON public.email_templates;
CREATE POLICY "email_templates_select" ON public.email_templates
  FOR SELECT USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_templates_insert" ON public.email_templates;
CREATE POLICY "email_templates_insert" ON public.email_templates
  FOR INSERT WITH CHECK (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_templates_update" ON public.email_templates;
CREATE POLICY "email_templates_update" ON public.email_templates
  FOR UPDATE USING (is_member_of(organization_id));

DROP POLICY IF EXISTS "email_templates_delete" ON public.email_templates;
CREATE POLICY "email_templates_delete" ON public.email_templates
  FOR DELETE USING (is_member_of(organization_id));
