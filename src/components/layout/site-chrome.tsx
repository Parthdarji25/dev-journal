import type { ReactNode } from 'react';
import { SearchLauncher } from '@/components/search/search-launcher';
import { getContent } from '@/lib/content';
import { Footer } from './footer';
import { Header } from './header';

/** Header, main landmark, footer and the search palette of every public page. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const { sections, tracks } = getContent();
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
      <SearchLauncher
        sections={sections.map((s) => ({ slug: s.slug, name: s.name }))}
        tracks={tracks.map((t) => ({ slug: t.slug, name: t.name }))}
      />
    </>
  );
}
