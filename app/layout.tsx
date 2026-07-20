import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@nova/renderer/fonts.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { TourProvider } from '@/components/tour/TourProvider';
import { PreloaderInit } from '@/components/ui/preloader-init';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
);

export const metadata: Metadata = {
  metadataBase,
  title: 'Nova',
  description:
    'A new star for personalized multi-agent learning. Turn any topic or document into an immersive, interactive classroom.',
  applicationName: 'Nova',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png' }],
  },
  appleWebApp: {
    title: 'Nova',
    statusBarStyle: 'default',
    capable: true,
  },
  openGraph: {
    title: 'Nova',
    description:
      'A new star for personalized multi-agent learning. Turn any topic or document into an immersive, interactive classroom.',
    images: [{ url: '/banner.svg', width: 1200, height: 400, alt: 'Nova' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nova',
    description:
      'A new star for personalized multi-agent learning. Turn any topic or document into an immersive, interactive classroom.',
    images: ['/banner.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#DB2777' },
    { media: '(prefers-color-scheme: dark)', color: '#EC4899' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <I18nProvider>
            <ServerProvidersInit />
            <AccessCodeGuard>
              <TourProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
              </TourProvider>
            </AccessCodeGuard>
            <Toaster position="top-center" />
            <PreloaderInit />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
