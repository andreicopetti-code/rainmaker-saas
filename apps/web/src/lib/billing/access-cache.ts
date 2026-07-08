/** Cookie curto para evitar RPC de billing a cada navegação. */

export const BILLING_ACCESS_COOKIE = 'cb_billing_access';
export const BILLING_ACCESS_TTL_MS = 90_000;

type BillingAccessCache = {
  /** 1 = liberado, 0 = bloqueado */
  a: 0 | 1;
  /** epoch ms de expiração */
  e: number;
  /** user id para invalidar se a sessão mudar */
  u: string;
};

export function readBillingAccessCache(
  cookieValue: string | undefined,
  userId: string,
): { hasAccess: boolean } | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(cookieValue) as BillingAccessCache;
    if (!parsed || typeof parsed.e !== 'number' || parsed.u !== userId) return null;
    if (Date.now() > parsed.e) return null;
    return { hasAccess: parsed.a === 1 };
  } catch {
    return null;
  }
}

export function buildBillingAccessCookieValue(
  userId: string,
  hasAccess: boolean,
  ttlMs = BILLING_ACCESS_TTL_MS,
): string {
  const payload: BillingAccessCache = {
    a: hasAccess ? 1 : 0,
    e: Date.now() + ttlMs,
    u: userId,
  };
  return JSON.stringify(payload);
}

export function billingAccessCookieOptions(maxAgeSec = Math.floor(BILLING_ACCESS_TTL_MS / 1000)) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSec,
  };
}
