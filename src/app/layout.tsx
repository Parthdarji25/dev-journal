import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { SearchLauncher } from '@/components/search/search-launcher';
import { getContent } from '@/lib/content';
import { OG_IMAGE } from '@/lib/metadata';
import { siteName, siteUrl } from '@/lib/site';
import { bodyFont, codeFont, displayFont } from '@/styles/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: "A notebook for everything I'm learning.",
  openGraph: { siteName, type: 'website', images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1115' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const { sections, tracks } = getContent();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable}`}
    >
      <head>
        {/* Track colours, generated from content/_meta/tracks.json by app/tracks.css/route.ts. */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- generated stylesheet, not a source file */}
        <link rel="stylesheet" href="/tracks.css" precedence="default" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
          <SearchLauncher
            sections={sections.map((s) => ({ slug: s.slug, name: s.name }))}
            tracks={tracks.map((t) => ({ slug: t.slug, name: t.name }))}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
