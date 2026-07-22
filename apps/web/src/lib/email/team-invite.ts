import { sendViaResend } from '@/lib/email/providers';

const FROM =
  process.env.EMAIL_FROM?.trim() ||
  'CEO Brain <noreply@ceobrain.com.br>';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeInviteEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || !isValidEmail(email)) return null;
  return email;
}

export async function sendTeamInviteEmail(params: {
  to: string;
  organizationName: string;
  inviterName: string | null;
  inviterEmail?: string | null;
  inviteUrl: string;
  expiresAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const expiresLabel = new Date(params.expiresAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const who = params.inviterName?.trim() || 'Um administrador';
  const org = params.organizationName.trim() || 'sua equipe';

  // Assunto curto e pessoal — menos “campanha”
  const subject = `${who} adicionou você em ${org}`;

  const text = [
    `Olá,`,
    '',
    `${who} pediu para você entrar na equipe "${org}" no CEO Brain.`,
    '',
    `Para aceitar, abra este link:`,
    params.inviteUrl,
    '',
    `Esse link vale até ${expiresLabel}.`,
    '',
    `Se não foi você quem esperava isso, ignore esta mensagem.`,
  ].join('\n');

  // HTML mínimo, sem botão estilizado — parece e-mail operacional
  const html = `
    <p>Olá,</p>
    <p>${escapeHtml(who)} pediu para você entrar na equipe "${escapeHtml(org)}" no CEO Brain.</p>
    <p>Para aceitar, abra este link:<br>
    <a href="${escapeHtml(params.inviteUrl)}">${escapeHtml(params.inviteUrl)}</a></p>
    <p>Esse link vale até ${escapeHtml(expiresLabel)}.</p>
    <p>Se não foi você quem esperava isso, ignore esta mensagem.</p>
  `.trim();

  const replyTo =
    params.inviterEmail && isValidEmail(params.inviterEmail)
      ? params.inviterEmail.trim().toLowerCase()
      : undefined;

  return sendViaResend({
    from: FROM,
    to: params.to,
    subject,
    body: text,
    html,
    replyTo,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
