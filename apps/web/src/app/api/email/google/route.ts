import { NextResponse } from 'next/server';
import { getGoogleConnectUrl } from '@/app/emails/actions';

export async function GET() {
  const url = await getGoogleConnectUrl();
  if (!url) {
    return NextResponse.json(
      { error: 'Google OAuth não configurado (GOOGLE_CLIENT_ID)' },
      { status: 503 },
    );
  }
  return NextResponse.redirect(url);
}
