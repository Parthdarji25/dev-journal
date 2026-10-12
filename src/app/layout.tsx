import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { siteName, siteUrl } from '@/lib/site';
import { bodyFont, codeFont, displayFont } from '@/styles/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: "A notebook for everything I'm learning.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1115' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable}`}
    >
      <body>
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
