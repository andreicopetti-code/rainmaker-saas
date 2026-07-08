import { NextRequest, NextResponse } from 'next/server';
import { completeGoogleOAuth } from '@/app/emails/actions';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirect = (params: Record<string, string>) => {
    const url = new URL('/emails', base);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return NextResponse.redirect(url.toString());
  };

  if (error) {
    return redirect({ setup: 'error', msg: error });
  }

  if (!code || !state) {
    return redirect({ setup: 'error', msg: 'missing_code' });
  }

  const result = await completeGoogleOAuth(code, state);
  if (!result.ok) {
    return redirect({ setup: 'error', msg: result.error ?? 'oauth_failed' });
  }

  return redirect({ setup: 'connected' });
}
