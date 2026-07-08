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
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // Supabase indisponível — deixa a página carregar; rotas protegidas redirecionam no server component
  }

  if (!user && isProtected) {
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
        const billing = await getBillingAccessForUser(supabase, user.id);
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
        // Falha na checagem — não bloqueia o app
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
