'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { trackClass } from '@/lib/nav';
import { LAST_TRACK_KEY, readStorage, writeStorage } from '@/lib/storage';

export interface CategoryBarTrack {
  slug: string;
  name: string;
  count: number;
}

/**
 * One pill per track with its colour and item count. Choosing a track
 * navigates to that track's prebuilt page (prefetched on hover or focus), so
 * a page only ever carries one track's data. The choice is remembered.
 *
 * On a section's index page (`redirectFromIndex`), a remembered track other
 * than the first one replaces the page with that track's page.
 */
export function CategoryBar({
  base,
  tracks,
  selected,
  redirectFromIndex = false,
}: {
  base: string;
  tracks: CategoryBarTrack[];
  selected: string;
  redirectFromIndex?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (redirectFromIndex) {
      const remembered = readStorage(LAST_TRACK_KEY);
      if (remembered && remembered !== selected && tracks.some((t) => t.slug === remembered)) {
        router.replace(`${base}/${remembered}`, { scroll: false });
      }
    } else {
      writeStorage(LAST_TRACK_KEY, selected);
    }
  }, [base, redirectFromIndex, router, selected, tracks]);

  return (
    <div role="group" aria-label="Choose a track" className="flex flex-wrap gap-2">
      {tracks.map((t) => {
        const href = `${base}/${t.slug}`;
        const active = t.slug === selected;
        return (
          <button
            key={t.slug}
            type="button"
            aria-pressed={active}
            onClick={() => {
              writeStorage(LAST_TRACK_KEY, t.slug);
              if (!active || redirectFromIndex) router.push(href, { scroll: false });
            }}
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            className={`${trackClass(t.slug)} inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active
                ? 'border-(--tc) bg-(--tt) text-text'
                : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
            }`}
          >
            <span aria-hidden className="size-2.5 rounded-[3px] bg-(--tc)" />
            {t.name}
            <span className="rounded-full bg-panel px-2 text-xs text-muted">
              <span className="sr-only">(</span>
              {t.count}
              <span className="sr-only"> items)</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
