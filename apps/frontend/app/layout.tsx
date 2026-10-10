import type { Metadata } from 'next';
import { Geist_Mono, Inter_Tight, Newsreader } from 'next/font/google';
import { APP_NAME } from '@/constants/project';
import './globals.css';
import { ThemeProvider } from '@vivexy/core/shared/theme-provider';
import { AuthProvider } from '@vivexy/core/shared/auth-provider';
import { Providers } from '@vivexy/core/shared/providers';
import { Toaster } from 'sonner';
import { AppShell } from '@vivexy/core/shared/app-shell';
import { Analytics } from '@vercel/analytics/next';

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
});

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  axes: ['opsz'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: `${APP_NAME} - AI Workspaces for Professional Teams`,
  description:
    'Build intelligent AI workspaces for Legal, Financial, and Compliance teams. White-label template for agencies and direct deployment for firms.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${interTight.variable} ${newsreader.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="skin"
          enableSystem={false}
          disableTransitionOnChange
          themes={['skin', 'dark', 'ocean', 'midnight', 'stone']}
        >
          <Providers>
            <AuthProvider>
              <AppShell appName={APP_NAME}>{children}</AppShell>
              <Toaster />
            </AuthProvider>
          </Providers>
        </ThemeProvider>
        {process.env.NEXT_DESKTOP !== '1' && <Analytics />}
      </body>
    </html>
  );
}
