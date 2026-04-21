import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter, Fraunces } from 'next/font/google';
import { APP_NAME } from '@/constants/project';
import './globals.css';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { AuthProvider } from '@/components/shared/auth-provider';
import { Providers } from '@/components/shared/providers';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/shared/app-shell';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz', 'WONK'],
});

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
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
        className={`${inter.variable} ${fraunces.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
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
              <AppShell>{children}</AppShell>
              <Toaster />
            </AuthProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
