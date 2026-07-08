import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getBillingAccessForUser } from '@/lib/billing/check-access';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    const redirect = url.searchParams.get('redirect');
    url.pathname = redirect && redirect.startsWith('/') ? redirect : '/funil';
    url.searchParams.delete('redirect');
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/funil';
    return NextResponse.redirect(url);
  }

  if (user && isProtected && !isBillingRoute && !isInviteRoute) {
    try {
      const billing = await getBillingAccessForUser(supabase, user.id);
      if (!billing.hasAccess) {
        const url = request.nextUrl.clone();
        url.pathname = '/billing';
        return NextResponse.redirect(url);
      }
    } catch {
      // Falha na checagem — não bloqueia o app
    }
  }

  return supabaseResponse;
}
