'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_EMAIL_TEMPLATES, parseAddressList, rowToListItem } from '@/lib/email/utils';
import {
  exchangeGoogleCode,
  fetchGmailInbox,
  getValidGmailAccessToken,
  sendViaEmailJs,
  sendViaGmail,
  sendViaResend,
} from '@/lib/email/providers';
import type {
  EmailAccountSettings,
  EmailJsConfig,
  EmailMessageRow,
  EmailTemplateRow,
  EmailsPageData,
  SendEmailInput,
} from '@/lib/email/types';

type OrgContext = { orgId: string; userId: string };

async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgRows } = await supabase.rpc('get_user_organization', { p_user_id: user.id });
  const org = orgRows?.[0];
  if (!org) return null;

  return { orgId: org.organization_id, userId: user.id };
}

type SettingsRow = {
  provider: string;
  from_email: string | null;
  from_name: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_expires_at: string | null;
  emailjs_service_id: string | null;
  emailjs_template_id: string | null;
  emailjs_public_key: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
};

function mapSettings(row: SettingsRow | null): EmailAccountSettings {
  if (!row) {
    return {
      provider: 'none',
      fromEmail: null,
      fromName: null,
      connected: false,
      lastSyncAt: null,
      emailjsConfigured: false,
    };
  }

  const emailjsConfigured = !!(
    row.emailjs_service_id &&
    row.emailjs_template_id &&
    row.emailjs_public_key &&
    row.from_email
  );

  return {
    provider: (row.provider as EmailAccountSettings['provider']) || 'none',
    fromEmail: row.from_email,
    fromName: row.from_name,
    connected: row.provider !== 'none' && !!row.from_email,
    lastSyncAt: row.last_sync_at,
    emailjsConfigured,
  };
}

async function ensureDefaultTemplates(orgId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { count } = await db
    .from('email_templates')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if (count && count > 0) return;

  await db.from('email_templates').insert(
    DEFAULT_EMAIL_TEMPLATES.map((tpl, i) => ({
      organization_id: orgId,
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      sort_order: i,
    })),
  );
}

async function loadDealLabels(orgId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const map = new Map<string, string>();

  const { data: funnel } = await supabase
    .from('funnels')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!funnel) return map;

  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, custom_fields, contact_id, contact:contacts(name, company)')
    .eq('organization_id', orgId)
    .eq('funnel_id', funnel.id)
    .is('deleted_at', null);

  for (const opp of opps ?? []) {
    const cf = opp.custom_fields as { fantasia?: string; empresa?: string } | null;
    const contact = opp.contact as { name?: string; company?: string } | null;
    const label =
      cf?.fantasia ||
      cf?.empresa ||
      contact?.company ||
      contact?.name ||
      `Deal ${opp.id.slice(0, 8)}`;
    map.set(opp.id, label);
  }

  return map;
}

async function loadSettingsRow(orgId: string): Promise<SettingsRow | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('email_account_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();
  return (data as SettingsRow | null) ?? null;
}

export async function getUnreadEmailCount(): Promise<number> {
  const ctx = await getOrgContext();
  if (!ctx) return 0;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId)
    .eq('direction', 'inbound')
    .eq('folder', 'inbox')
    .eq('is_read', false)
    .is('deleted_at', null);

  return count ?? 0;
}

export async function syncGmailInbox(orgId: string, settings: SettingsRow): Promise<void> {
  if (settings.provider !== 'gmail' || !settings.oauth_access_token) return;

  const accessToken = await getValidGmailAccessToken({
    accessToken: settings.oauth_access_token,
    refreshToken: settings.oauth_refresh_token,
    expiresAt: settings.oauth_expires_at,
  });

  if (!accessToken) return;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  if (
    settings.oauth_refresh_token &&
    settings.oauth_expires_at &&
    new Date(settings.oauth_expires_at).getTime() <= Date.now() + 60_000
  ) {
    const { refreshGoogleAccessToken } = await import('@/lib/email/providers');
    const refreshed = await refreshGoogleAccessToken(settings.oauth_refresh_token!);
    if (refreshed) {
      await db
        .from('email_account_settings')
        .update({
          oauth_access_token: refreshed.accessToken,
          oauth_expires_at: refreshed.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId);
    }
  }

  const { messages, error } = await fetchGmailInbox(accessToken, settings.last_sync_at);
  if (error) {
    console.error('[email sync]', error);
    return;
  }

  for (const msg of messages) {
    const { data: existing } = await db
      .from('email_messages')
      .select('id')
      .eq('organization_id', orgId)
      .eq('external_id', msg.externalId)
      .maybeSingle();

    if (existing) continue;

    await db.from('email_messages').insert({
      organization_id: orgId,
      direction: 'inbound',
      folder: 'inbox',
      from_address: msg.fromAddress,
      from_name: msg.fromName,
      to_addresses: msg.toAddresses,
      subject: msg.subject,
      body_text: msg.bodyText,
      external_id: msg.externalId,
      thread_id: msg.threadId,
      send_status: 'received',
      is_read: false,
      received_at: msg.receivedAt,
      created_at: msg.receivedAt,
    });
  }

  await db
    .from('email_account_settings')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);
}

export async function getEmailsData(): Promise<EmailsPageData | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;

  await ensureDefaultTemplates(ctx.orgId);

  const settingsRow = await loadSettingsRow(ctx.orgId);
  if (settingsRow?.provider === 'gmail') {
    await syncGmailInbox(ctx.orgId, settingsRow);
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [messagesRes, templatesRes, dealsRes, unread] = await Promise.all([
    db
      .from('email_messages')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    db
      .from('email_templates')
      .select('id, name, subject, body, sort_order')
      .eq('organization_id', ctx.orgId)
      .order('sort_order'),
    loadDealOptions(ctx.orgId),
    getUnreadEmailCount(),
  ]);

  const dealLabels = await loadDealLabels(ctx.orgId);
  const messages = ((messagesRes.data ?? []) as EmailMessageRow[]).map((row) =>
    rowToListItem(
      { ...row, to_addresses: parseAddressList(row.to_addresses) } as EmailMessageRow,
      dealLabels,
    ),
  );

  return {
    messages,
    templates: (templatesRes.data ?? []) as EmailTemplateRow[],
    settings: mapSettings(settingsRow),
    deals: dealsRes,
    unreadCount: unread,
  };
}

async function loadDealOptions(orgId: string) {
  const supabase = await createClient();
  const { data: funnel } = await supabase
    .from('funnels')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!funnel) return [];

  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, stage, custom_fields, contact:contacts(name, company, email)')
    .eq('organization_id', orgId)
    .eq('funnel_id', funnel.id)
    .is('deleted_at', null);

  return (opps ?? [])
    .filter((opp) => opp.stage !== 'Ganho' && opp.stage !== 'Perdido')
    .map((opp) => {
    const cf = opp.custom_fields as { fantasia?: string; empresa?: string } | null;
    const contact = opp.contact as { name?: string; company?: string; email?: string } | null;
    const label =
      cf?.fantasia ||
      cf?.empresa ||
      contact?.company ||
      contact?.name ||
      `Deal ${opp.id.slice(0, 8)}`;
      return {
        id: opp.id,
        label,
        contactEmail: contact?.email ?? null,
      };
    });
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!to || !to.includes('@')) return { ok: false, error: 'Destinatário inválido' };
  if (!subject) return { ok: false, error: 'Informe o assunto' };
  if (!body) return { ok: false, error: 'Escreva a mensagem' };

  const settingsRow = await loadSettingsRow(ctx.orgId);
  if (!settingsRow || settingsRow.provider === 'none' || !settingsRow.from_email) {
    return { ok: false, error: 'Configure sua conta de e-mail antes de enviar' };
  }

  const fromEmail = settingsRow.from_email;
  const fromName = settingsRow.from_name || 'CEO Brain';
  const now = new Date().toISOString();
  let externalId: string | undefined;
  let realSend = false;
  let sendStatus: 'sent' | 'delivered' | 'failed' = 'sent';
  let errorMsg: string | undefined;

  if (settingsRow.provider === 'gmail') {
    const accessToken = await getValidGmailAccessToken({
      accessToken: settingsRow.oauth_access_token ?? '',
      refreshToken: settingsRow.oauth_refresh_token,
      expiresAt: settingsRow.oauth_expires_at,
    });
    if (!accessToken) return { ok: false, error: 'Sessão Gmail expirada. Reconecte sua conta.' };

    const result = await sendViaGmail(accessToken, {
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      body,
    });
    if (!result.ok) return { ok: false, error: result.error };
    externalId = result.externalId;
    realSend = true;
    sendStatus = 'delivered';
  } else if (settingsRow.provider === 'emailjs') {
    const config: EmailJsConfig = {
      fromEmail,
      serviceId: settingsRow.emailjs_service_id!,
      templateId: settingsRow.emailjs_template_id!,
      publicKey: settingsRow.emailjs_public_key!,
    };
    const result = await sendViaEmailJs(config, { to, subject, body });
    if (!result.ok) return { ok: false, error: result.error };
    realSend = true;
    sendStatus = 'delivered';
  } else if (settingsRow.provider === 'resend') {
    const result = await sendViaResend({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      body,
    });
    if (!result.ok) return { ok: false, error: result.error };
    externalId = result.externalId;
    realSend = true;
    sendStatus = 'delivered';
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: inserted, error } = await db
    .from('email_messages')
    .insert({
      organization_id: ctx.orgId,
      user_id: ctx.userId,
      direction: 'outbound',
      folder: 'sent',
      from_address: fromEmail,
      from_name: fromName,
      to_addresses: [to],
      subject,
      body_text: body,
      opportunity_id: input.opportunityId || null,
      in_reply_to: input.inReplyTo || null,
      external_id: externalId ?? null,
      send_status: sendStatus,
      real_send: realSend,
      is_read: true,
      sent_at: now,
      created_at: now,
      tracking: {
        status: sendStatus,
        sentAt: now,
        deliveredAt: realSend ? now : undefined,
      },
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, error: error?.message ?? 'Erro ao salvar e-mail' };

  const periodKey = new Date().toISOString().slice(0, 7);
  await db.rpc('increment_usage_counter', {
    p_org_id: ctx.orgId,
    p_kind: 'email_send',
    p_period_key: periodKey,
  });

  revalidatePath('/emails');
  return { ok: true, id: inserted.id as string };
}

export async function markEmailRead(
  id: string,
  isRead: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_messages')
    .update({ is_read: isRead, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function deleteEmail(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_messages')
    .update({ deleted_at: new Date().toISOString(), folder: 'trash' })
    .eq('id', id)
    .eq('organization_id', ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function saveEmailTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Informe o nome do template' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  if (input.id) {
    const { error } = await db
      .from('email_templates')
      .update({
        name,
        subject: input.subject,
        body: input.body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('organization_id', ctx.orgId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from('email_templates').insert({
      organization_id: ctx.orgId,
      name,
      subject: input.subject,
      body: input.body,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/emails');
  return { ok: true };
}

export async function deleteEmailTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_templates')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function saveEmailJsSettings(input: EmailJsConfig): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  if (!input.fromEmail.includes('@')) return { ok: false, error: 'E-mail remetente inválido' };
  if (!input.serviceId.startsWith('service_')) return { ok: false, error: 'Service ID inválido' };
  if (!input.templateId.startsWith('template_')) return { ok: false, error: 'Template ID inválido' };
  if (!input.publicKey.trim()) return { ok: false, error: 'Public Key obrigatória' };

  const test = await sendViaEmailJs(input, {
    to: input.fromEmail,
    subject: '✅ CEO Brain — Conexão de e-mail confirmada',
    body: 'Parabéns! Seu CEO Brain está configurado e pronto para enviar e-mails reais.',
  });

  if (!test.ok) return { ok: false, error: test.error };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error } = await db.from('email_account_settings').upsert(
    {
      organization_id: ctx.orgId,
      provider: 'emailjs',
      from_email: input.fromEmail,
      from_name: 'CEO Brain',
      emailjs_service_id: input.serviceId,
      emailjs_template_id: input.templateId,
      emailjs_public_key: input.publicKey,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function disconnectEmailAccount(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_account_settings')
    .delete()
    .eq('organization_id', ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function connectResendFallback(fromEmail: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'Resend não configurado no servidor' };
  }
  if (!fromEmail.includes('@')) return { ok: false, error: 'E-mail inválido' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('email_account_settings').upsert(
    {
      organization_id: ctx.orgId,
      provider: 'resend',
      from_email: fromEmail,
      from_name: 'CEO Brain',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails');
  return { ok: true };
}

export async function getGoogleConnectUrl(): Promise<string | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;

  const { getGoogleOAuthUrl } = await import('@/lib/email/providers');
  const state = Buffer.from(JSON.stringify({ orgId: ctx.orgId, userId: ctx.userId })).toString('base64url');
  return getGoogleOAuthUrl(state);
}

export async function completeGoogleOAuth(code: string, state: string): Promise<{ ok: boolean; error?: string }> {
  let parsed: { orgId: string; userId: string };
  try {
    parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, error: 'State inválido' };
  }

  const tokens = await exchangeGoogleCode(code);
  if (!tokens) return { ok: false, error: 'Falha ao obter tokens do Google' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('email_account_settings').upsert(
    {
      organization_id: parsed.orgId,
      provider: 'gmail',
      from_email: tokens.email,
      from_name: 'CEO Brain',
      oauth_access_token: tokens.accessToken,
      oauth_refresh_token: tokens.refreshToken,
      oauth_expires_at: tokens.expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );

  if (error) return { ok: false, error: error.message };

  await syncGmailInbox(parsed.orgId, {
    provider: 'gmail',
    from_email: tokens.email,
    from_name: 'CEO Brain',
    oauth_access_token: tokens.accessToken,
    oauth_refresh_token: tokens.refreshToken,
    oauth_expires_at: tokens.expiresAt,
    emailjs_service_id: null,
    emailjs_template_id: null,
    emailjs_public_key: null,
    last_sync_at: null,
    connected_at: new Date().toISOString(),
  });

  revalidatePath('/emails');
  return { ok: true };
}

export async function refreshInbox(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: 'Não autenticado' };

  const settingsRow = await loadSettingsRow(ctx.orgId);
  if (!settingsRow || settingsRow.provider !== 'gmail') {
    return { ok: false, error: 'Conecte o Gmail para sincronizar a caixa de entrada' };
  }

  await syncGmailInbox(ctx.orgId, settingsRow);
  revalidatePath('/emails');
  return { ok: true };
}
