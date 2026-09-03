import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getBillingAccessForUser } from '@/lib/billing/check-access';
import {
  BILLING_ACCESS_COOKIE,
  billingAccessCookieOptions,
  buildBillingAccessCookieValue,
  readBillingAccessCache,
} from '@/lib/billing/access-cache';

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

/** Evita 504 MIDDLEWARE_INVOCATION_TIMEOUT quando Auth/Postgres estão lentos (disco cheio). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`middleware_timeout_${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (c) => c.name.includes('auth-token') || c.name.startsWith('sb-'),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register');

  const isPublicAppRoute =
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/precos') ||
    pathname.startsWith('/convite');

  const isBillingRoute = pathname.startsWith('/billing');
  const isInviteRoute = pathname.startsWith('/convite');
  const isStripeWebhook = pathname.startsWith('/api/stripe/webhook');

  const isProtected =
    !isPublicAppRoute &&
    !isAuthRoute &&
    !isStripeWebhook &&
    !pathname.startsWith('/_next') &&
    !pathname.includes('.');

  // Rotas públicas sem gate de auth: sem round-trip de sessão.
  if (!isProtected && !isAuthRoute && pathname !== '/') {
    return NextResponse.next({ request });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user = null;
  let authTimedOut = false;
  try {
    ({
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 4_000));
  } catch {
    authTimedOut = true;
    // Auth/Postgres lento: não bloqueia o middleware até o 504 da Vercel.
  }

  // Sem user confirmado: em rota protegida, só manda p/ login se não há cookie de sessão.
  // Se o Auth timeoutou mas o cookie existe, deixa a página/SSR decidir (fail-open temporário).
  if (!user && isProtected) {
    if (authTimedOut && hasSupabaseAuthCookie(request)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    const res = NextResponse.redirect(url);
    copyCookies(supabaseResponse, res);
    return res;
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    const redirect = url.searchParams.get('redirect');
    url.pathname = redirect && redirect.startsWith('/') ? redirect : '/funil';
    url.searchParams.delete('redirect');
    const res = NextResponse.redirect(url);
    copyCookies(supabaseResponse, res);
    return res;
  }

  if (user && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/funil';
    const res = NextResponse.redirect(url);
    copyCookies(supabaseResponse, res);
    return res;
  }

  // Em /billing, limpa o cache para revalidar após checkout/cancelamento.
  if (user && isBillingRoute) {
    supabaseResponse.cookies.set(BILLING_ACCESS_COOKIE, '', {
      ...billingAccessCookieOptions(0),
      maxAge: 0,
    });
  }

  if (user && isProtected && !isBillingRoute && !isInviteRoute) {
    const cached = readBillingAccessCache(
      request.cookies.get(BILLING_ACCESS_COOKIE)?.value,
      user.id,
    );

    // Só reutiliza cache positivo: bloqueio sempre revalida (pós-pagamento).
    let hasAccess = cached?.hasAccess === true ? true : undefined;

    if (hasAccess === undefined) {
      try {
        const billing = await withTimeout(
          getBillingAccessForUser(supabase, user.id),
          3_000,
        );
        hasAccess = billing.hasAccess;
        if (billing.hasAccess) {
          supabaseResponse.cookies.set(
            BILLING_ACCESS_COOKIE,
            buildBillingAccessCookieValue(user.id, true),
            billingAccessCookieOptions(),
          );
        } else {
          supabaseResponse.cookies.set(BILLING_ACCESS_COOKIE, '', {
            ...billingAccessCookieOptions(0),
            maxAge: 0,
          });
        }
      } catch {
        // Timeout/DB lento: não manda para /billing (evita loop + 504). SSR revalida depois.
        hasAccess = true;
      }
    }

    if (hasAccess === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/billing';
      const res = NextResponse.redirect(url);
      copyCookies(supabaseResponse, res);
      return res;
    }
  }

  return supabaseResponse;
}
