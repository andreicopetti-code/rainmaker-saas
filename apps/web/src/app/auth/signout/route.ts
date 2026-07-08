import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BILLING_ACCESS_COOKIE } from '@/lib/billing/access-cache';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete(BILLING_ACCESS_COOKIE);
  redirect('/login');
}
