'use client';

import { useEffect, useState } from 'react';

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** "On this page" with scroll-spy: the last heading above the top 30% of the viewport is active. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? '');

  useEffect(() => {
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.3;
        let current = headings[0]?.id ?? '';
        for (const h of headings) {
          if (h.getBoundingClientRect().top <= line) current = h.id;
        }
        // At the bottom of the page the last headings can never reach the line.
        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        if (atBottom && window.scrollY > 0) current = headings[headings.length - 1]?.id ?? current;
        setActive(current);
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, [entries]);

  if (entries.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">On this page</p>
      <ul className="space-y-0.5 border-l border-border text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              aria-current={active === e.id ? 'location' : undefined}
              className={`-ml-px flex min-h-9 items-center border-l-2 py-1 ${e.depth === 3 ? 'pl-6' : 'pl-3'} ${
                active === e.id
                  ? 'border-text font-semibold text-text'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
