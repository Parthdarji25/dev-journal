'use client';

import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { ParsedResource } from '@/lib/content/markdown/parse';
import { RESOURCE_TYPES, type ResourceType } from '@/lib/schema/constants';

const TYPE_LABEL: Record<ResourceType, string> = {
  docs: 'Docs',
  course: 'Course',
  video: 'Video',
  book: 'Book',
};

/** Type filter (All, Docs, Course, Video, Book with counts) and the link rows. */
export function ResourceBrowser({ links }: { links: ParsedResource[] }) {
  const [type, setType] = useState<ResourceType | 'all'>('all');
  const visible = type === 'all' ? links : links.filter((l) => l.type === type);
  const options: { value: ResourceType | 'all'; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: links.length },
    ...RESOURCE_TYPES.map((t) => ({
      value: t,
      label: TYPE_LABEL[t],
      count: links.filter((l) => l.type === t).length,
    })),
  ];

  return (
    <div>
      <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={type === o.value}
            onClick={() => setType(o.value)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
              type === o.value
                ? 'border-(--tc) bg-surface text-text'
                : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
            }`}
          >
            {o.label}
            <span className="rounded-full bg-panel px-2 text-xs text-muted">{o.count}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {visible.length} of {links.length} links
      </p>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg border-2 border-dashed border-dash px-6 py-8 text-center text-muted">
          No {TYPE_LABEL[type as ResourceType]?.toLowerCase()} links yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {visible.map((link) => (
            <li key={link.url + link.title}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-nav-active"
              >
                <span className="inline-flex w-16 justify-center rounded-full border border-border bg-panel py-0.5 text-xs font-semibold text-soft">
                  {TYPE_LABEL[link.type]}
                </span>
                <span className="font-semibold text-text">{link.title}</span>
                <span className="text-sm text-muted">{link.domain}</span>
                <ExternalLink aria-hidden className="size-3.5 text-muted" />
                <span className="sr-only">(opens in a new tab)</span>
                {link.note && (
                  <span className="w-full text-sm text-soft sm:ml-[4.75rem]">{link.note}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
