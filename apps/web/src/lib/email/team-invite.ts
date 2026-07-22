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
  inviteUrl: string;
  expiresAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const expiresLabel = new Date(params.expiresAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const who = params.inviterName?.trim() || 'Um administrador';
  const subject = `Convite para a equipe ${params.organizationName} — CEO Brain`;

  const text = [
    `${who} convidou você para a equipe ${params.organizationName} no CEO Brain.`,
    '',
    `Aceite o convite neste link:`,
    params.inviteUrl,
    '',
    `O convite expira em ${expiresLabel}.`,
    '',
    'Se você não esperava este e-mail, pode ignorá-lo.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 12px;font-size:20px">Convite para o CEO Brain</h2>
      <p style="margin:0 0 12px">
        <strong>${escapeHtml(who)}</strong> convidou você para a equipe
        <strong>${escapeHtml(params.organizationName)}</strong>.
      </p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(params.inviteUrl)}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">
          Aceitar convite
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#475569">
        Ou copie e cole este link no navegador:<br/>
        <a href="${escapeHtml(params.inviteUrl)}">${escapeHtml(params.inviteUrl)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b">
        O convite expira em ${escapeHtml(expiresLabel)}.
        Se você não esperava este e-mail, pode ignorá-lo.
      </p>
    </div>
  `.trim();

  return sendViaResend({
    from: FROM,
    to: params.to,
    subject,
    body: text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
