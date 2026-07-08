import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { getCurrentUserProfile } from '@/app/auth/actions';
import { AppShell } from '@/components/AppShell';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CEO Brain',
  description: 'Copiloto executivo comercial',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialUserProfile = await getCurrentUserProfile();

  return (
    <html lang="pt-BR" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ceo-brain-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppShell initialUserProfile={initialUserProfile}>{children}</AppShell>
      </body>
    </html>
  );
}
