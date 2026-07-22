-- Store invited email for team invites (transactional Resend delivery)
ALTER TABLE public.invite_tokens
  ADD COLUMN IF NOT EXISTS invited_email text;

CREATE INDEX IF NOT EXISTS idx_invite_tokens_invited_email
  ON public.invite_tokens (organization_id, invited_email)
  WHERE invited_email IS NOT NULL AND used = false;
