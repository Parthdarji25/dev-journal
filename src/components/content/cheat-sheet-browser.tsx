'use client';

import { Check, Copy } from 'lucide-react';
import { useId, useState } from 'react';
import type { CheatGroup } from '@/lib/content/markdown/parse';
import { copyText } from './code-copy';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : `Copy ${text}`}
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-nav-active hover:text-text"
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
    </button>
  );
}

/** Filter input plus one card per group; each row has the code, what it does and a Copy button. */
export function CheatSheetBrowser({ groups }: { groups: CheatGroup[] }) {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      rows: q
        ? g.rows.filter(
            (r) => r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
          )
        : g.rows,
    }))
    .filter((g) => !q || g.rows.length > 0 || g.title.toLowerCase().includes(q));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const shown = filtered.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="sr-only">
          Filter this sheet
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this sheet..."
          className="min-h-11 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-text placeholder:text-muted"
        />
        <p className="text-sm text-muted" aria-live="polite">
          {shown} of {total} entries
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-lg border-2 border-dashed border-dash px-6 py-8 text-center text-muted">
          Nothing matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {filtered.map((group, gi) => (
            <section
              key={`${group.title}-${gi}`}
              aria-label={group.title || 'Entries'}
              className="rounded-lg border border-border bg-surface"
            >
              {group.title && (
                <h4 className="border-b border-border px-4 py-3 font-heading text-base font-semibold">
                  {group.title}
                </h4>
              )}
              {group.rows.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">No entries yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {group.rows.map((row, ri) => (
                    <li key={ri} className="flex items-start gap-2 py-2 pr-1 pl-4">
                      <div className="min-w-0 flex-1 py-1.5">
                        <code className="block overflow-x-auto font-mono text-sm font-semibold whitespace-pre text-(--tc)">
                          {row.code}
                        </code>
                        <span className="mt-0.5 block text-sm text-soft">{row.description}</span>
                      </div>
                      {row.code && <CopyButton text={row.code} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
