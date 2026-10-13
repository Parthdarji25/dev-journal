'use client';

import { Command } from 'cmdk';
import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { trackClass } from '@/lib/nav';
import { loadPagefind, search, type SearchResult } from '@/lib/search/pagefind';
import type { Option } from './search-launcher';

export interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
  sections: Option[];
  tracks: Option[];
}

/** Loads the Pagefind script (not the index) ahead of the first open. */
export function prefetchSearch() {
  void loadPagefind().catch(() => {});
}

type Status = 'idle' | 'loading' | 'done' | 'error';

const chip = (active: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
    active
      ? 'border-text bg-nav-active text-text'
      : 'border-border text-soft hover:bg-nav-active hover:text-text'
  }`;

export function SearchPalette({ open, onClose, sections, tracks }: SearchPaletteProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('');
  const [track, setTrack] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const requestRef = useRef(0);

  const sectionName = new Map(sections.map((s) => [s.slug, s.name]));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    const request = ++requestRef.current;
    if (!term) {
      const reset = window.setTimeout(() => {
        setResults([]);
        setStatus('idle');
      }, 0);
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(() => {
      setStatus('loading');
      search(term, { section, track })
        .then((found) => {
          if (request !== requestRef.current) return;
          setResults(found);
          setStatus('done');
        })
        .catch(() => {
          if (request !== requestRef.current) return;
          setResults([]);
          setStatus('error');
        });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query, section, track]);

  function go(url: string) {
    onClose();
    router.push(url);
  }

  /** Keeps Tab inside the dialog. */
  function trapFocus(e: ReactKeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return;
    const focusable = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('input, button:not([disabled]), select'),
    ].filter((el) => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  const term = query.trim();
  const countText =
    status === 'done'
      ? `${results.length} result${results.length === 1 ? '' : 's'}`
      : status === 'loading'
        ? 'Searching...'
        : '';

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search everything"
      onClose={onClose}
      onKeyDown={trapFocus}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-[8vh] w-[min(40rem,calc(100%-2rem))] max-w-none rounded-xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/50"
    >
      <Command
        label="Search everything"
        shouldFilter={false}
        loop
        className="flex max-h-[80vh] flex-col"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-5 shrink-0 text-muted" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search everything..."
            className="min-h-14 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-nav-active hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div role="group" aria-label="Filter by section" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={section === ''}
              onClick={() => setSection('')}
              className={chip(section === '')}
            >
              All
            </button>
            {sections.map((s) => (
              <button
                key={s.slug}
                type="button"
                aria-pressed={section === s.slug}
                onClick={() => setSection(s.slug)}
                className={chip(section === s.slug)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted">
            Track
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              className="min-h-9 rounded-md border border-border bg-bg px-2 text-sm text-text"
            >
              <option value="">All tracks</option>
              {tracks.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p aria-live="polite" className="px-4 pt-2 text-xs text-muted empty:hidden">
          {countText}
        </p>

        <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
          {!term && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Type to search notes, roadmaps, mind maps, questions, cheat sheets and resources.
            </p>
          )}
          {term && status === 'done' && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No results for &ldquo;{term}&rdquo;.
            </p>
          )}
          {status === 'error' && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Search is not available right now.
            </p>
          )}
          {results.map((r) => (
            <Command.Item
              key={r.id}
              value={r.id}
              onSelect={() => go(r.url)}
              className="flex cursor-pointer gap-3 rounded-md px-3 py-2.5 data-[selected=true]:bg-nav-active"
            >
              <span
                aria-hidden
                className={`${r.track ? trackClass(r.track) : ''} mt-2 size-2 shrink-0 rounded-full bg-(--tc)`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-text">{r.title}</span>
                  {r.section && (
                    <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-px text-[11px] font-semibold text-soft">
                      {sectionName.get(r.section) ?? r.section}
                    </span>
                  )}
                </span>
                <span
                  className="mt-0.5 line-clamp-2 block text-sm text-soft [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-text"
                  dangerouslySetInnerHTML={{ __html: r.excerpt }}
                />
              </span>
            </Command.Item>
          ))}
        </Command.List>

        <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted sm:flex">
          <span>
            <kbd className="font-mono">↑ ↓</kbd> to move
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> to open
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> to close
          </span>
        </div>
      </Command>
    </dialog>
  );
}
