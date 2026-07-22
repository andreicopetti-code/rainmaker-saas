import type { EmailJsConfig } from './types';

type GmailTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function getValidGmailAccessToken(tokens: GmailTokens): Promise<string | null> {
  if (tokens.accessToken && tokens.expiresAt) {
    const expires = new Date(tokens.expiresAt).getTime();
    if (expires > Date.now() + 60_000) return tokens.accessToken;
  }
  if (!tokens.refreshToken) return tokens.accessToken || null;
  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken);
  return refreshed?.accessToken ?? null;
}

function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

export async function sendViaGmail(
  accessToken: string,
  params: { from: string; to: string; subject: string; body: string },
): Promise<{ ok: true; externalId?: string } | { ok: false; error: string }> {
  const raw = buildRawEmail(params);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err || `Gmail API ${res.status}` };
  }

  const data = (await res.json()) as { id?: string };
  return { ok: true, externalId: data.id };
}

export async function sendViaEmailJs(
  config: EmailJsConfig,
  params: { to: string; subject: string; body: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: {
        to_email: params.to,
        subject: params.subject,
        message: params.body,
        from_name: config.fromEmail,
        reply_to: config.fromEmail,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err || `EmailJS ${res.status}` };
  }
  return { ok: true };
}

export async function sendViaResend(
  params: {
    from: string;
    to: string;
    subject: string;
    body: string;
    html?: string;
    replyTo?: string;
  },
): Promise<{ ok: true; externalId?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY não configurada' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.body,
      ...(params.html ? { html: params.html } : {}),
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err || `Resend ${res.status}` };
  }

  const data = (await res.json()) as { id?: string };
  return { ok: true, externalId: data.id };
}

type GmailHeader = { name: string; value: string };

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

type MimePayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: MimePayload[];
};

function extractBody(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as MimePayload;
  if (p.body?.data) {
    return decodeBase64Url(p.body.data);
  }
  if (p.parts) {
    for (const part of p.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of p.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, ' ');
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

export type SyncedGmailMessage = {
  externalId: string;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: string;
};

export async function fetchGmailInbox(
  accessToken: string,
  afterDate?: string | null,
): Promise<{ messages: SyncedGmailMessage[]; error?: string }> {
  const q = afterDate ? `after:${Math.floor(new Date(afterDate).getTime() / 1000)}` : '';
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('labelIds', 'INBOX');
  listUrl.searchParams.set('maxResults', '50');
  if (q) listUrl.searchParams.set('q', q);

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    return { messages: [], error: await listRes.text() };
  }

  const listData = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = listData.messages?.map((m) => m.id) ?? [];
  const results: SyncedGmailMessage[] = [];

  for (const id of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as {
      id: string;
      threadId?: string;
      internalDate?: string;
      payload?: {
        headers?: GmailHeader[];
        mimeType?: string;
        body?: { data?: string };
        parts?: unknown[];
      };
    };

    const headers = msg.payload?.headers;
    const fromRaw = headerValue(headers, 'From');
    const fromMatch = fromRaw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
    const fromName = fromMatch?.[1]?.trim() || null;
    const fromAddress = fromMatch?.[2]?.trim() || fromRaw;
    const toRaw = headerValue(headers, 'To');
    const toAddresses = toRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));

    results.push({
      externalId: msg.id,
      threadId: msg.threadId ?? null,
      fromAddress,
      fromName,
      toAddresses,
      subject: headerValue(headers, 'Subject') || '(sem assunto)',
      bodyText: extractBody(msg.payload),
      receivedAt: msg.internalDate
        ? new Date(Number(msg.internalDate)).toISOString()
        : new Date().toISOString(),
    });
  }

  return { messages: results };
}

export function getGoogleOAuthUrl(state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/google/callback`;

  if (!clientId) return null;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  );
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  email: string | null;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/google/callback`;

  if (!clientId || !clientSecret) return null;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = userRes.ok
    ? ((await userRes.json()) as { email?: string })
    : null;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    email: user?.email ?? null,
  };
}
