'use client';

import { useState } from 'react';
import { trackClass } from '@/lib/nav';

/**
 * Client-side track filter (All + one pill per track). It shows and hides the
 * server-rendered `[data-track-panel]` sections inside `#targetId`.
 */
export function TrackFilter({
  tracks,
  targetId,
}: {
  tracks: { slug: string; name: string }[];
  targetId: string;
}) {
  const [selected, setSelected] = useState('all');

  function choose(slug: string) {
    setSelected(slug);
    document.querySelectorAll<HTMLElement>(`#${targetId} [data-track-panel]`).forEach((panel) => {
      panel.hidden = slug !== 'all' && panel.dataset.trackPanel !== slug;
    });
  }

  const pill = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
      active
        ? 'border-(--tc) bg-(--tt) text-text'
        : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
    }`;

  return (
    <div role="group" aria-label="Filter by track" className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={selected === 'all'}
        onClick={() => choose('all')}
        className={pill(selected === 'all')}
      >
        All
      </button>
      {tracks.map((t) => (
        <button
          key={t.slug}
          type="button"
          aria-pressed={selected === t.slug}
          onClick={() => choose(t.slug)}
          className={`${trackClass(t.slug)} ${pill(selected === t.slug)}`}
        >
          <span aria-hidden className="size-2.5 rounded-[3px] bg-(--tc)" />
          {t.name}
        </button>
      ))}
    </div>
  );
}
