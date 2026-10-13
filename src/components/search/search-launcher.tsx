'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import type { SearchPaletteProps } from './search-palette';

export interface Option {
  slug: string;
  name: string;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Always-loaded, tiny: listens for Cmd/Ctrl+K, "/" and the "open-search"
 * event, and loads the palette (cmdk + Pagefind) only when it is first
 * needed. "prefetch-search" (hover or focus on a search button) loads the
 * palette chunk and the Pagefind script ahead of time; the index itself
 * loads on the first search.
 */
export function SearchLauncher({ sections, tracks }: { sections: Option[]; tracks: Option[] }) {
  const [open, setOpen] = useState(false);
  const [Palette, setPalette] = useState<ComponentType<SearchPaletteProps> | null>(null);

  const load = useCallback(async () => {
    const mod = await import('./search-palette');
    setPalette(() => mod.SearchPalette);
    return mod;
  }, []);

  useEffect(() => {
    const show = () => {
      void load();
      setOpen(true);
    };
    const prefetch = () => {
      void load().then((mod) => mod.prefetchSearch());
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('open-search', show);
    window.addEventListener('prefetch-search', prefetch);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('open-search', show);
      window.removeEventListener('prefetch-search', prefetch);
      document.removeEventListener('keydown', onKey);
    };
  }, [load]);

  return Palette ? (
    <Palette open={open} onClose={() => setOpen(false)} sections={sections} tracks={tracks} />
  ) : null;
}

/** For search buttons: start loading the palette when the pointer or focus arrives. */
export function prefetchSearch() {
  window.dispatchEvent(new Event('prefetch-search'));
}
