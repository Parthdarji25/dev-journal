'use client';

import { Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DifficultyChip } from '@/components/ui/chip';
import { buttonClass } from '@/components/ui/styles';
import type { Difficulty } from '@/lib/schema';

export interface QuestionItem {
  slug: string;
  question: string;
  difficulty: Difficulty;
  companies: string[];
}

type DifficultyFilter = Difficulty | 'all';

const DIFFICULTY_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}

const pill = (active: boolean) =>
  `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
    active
      ? 'border-(--tc) bg-surface text-text'
      : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
  }`;

/**
 * Company and difficulty filters, "x of y", Show all answers and Shuffle.
 * `answers[i]` is the server-rendered answer of `items[i]`.
 */
export function QuestionBrowser({
  items,
  answers,
}: {
  items: QuestionItem[];
  answers: ReactNode[];
}) {
  const [company, setCompany] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const companies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of items) for (const c of q.companies) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  // A link to "#<slug>" (e.g. from a track hub) opens that answer.
  useEffect(() => {
    const openFromHash = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (slug && items.some((q) => q.slug === slug)) {
        setOpen((prev) => new Set(prev).add(slug));
        document.getElementById(slug)?.scrollIntoView({ block: 'start' });
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [items]);

  const visible = order
    .map((i) => ({ q: items[i] as QuestionItem, answer: answers[i] }))
    .filter(
      ({ q }) =>
        (company === 'all' || q.companies.includes(company)) &&
        (difficulty === 'all' || q.difficulty === difficulty),
    );
  const allOpen = visible.length > 0 && visible.every(({ q }) => open.has(q.slug));

  function toggle(slug: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleAll() {
    setOpen((prev) => {
      const next = new Set(prev);
      for (const { q } of visible) {
        if (allOpen) next.delete(q.slug);
        else next.add(q.slug);
      }
      return next;
    });
  }

  return (
    <div>
      {companies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-muted">Asked by</span>
          <div role="group" aria-label="Filter by company" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={company === 'all'}
              onClick={() => setCompany('all')}
              className={pill(company === 'all')}
            >
              All
              <span className="rounded-full bg-panel px-2 text-xs text-muted">{items.length}</span>
            </button>
            {companies.map(([name, count]) => (
              <button
                key={name}
                type="button"
                aria-pressed={company === name}
                onClick={() => setCompany(name)}
                className={pill(company === name)}
              >
                {name}
                <span className="rounded-full bg-panel px-2 text-xs text-muted">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Filter by difficulty"
          className="inline-flex rounded-md border border-border bg-surface p-1"
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={difficulty === o.value}
              onClick={() => setDifficulty(o.value)}
              className={`min-h-11 rounded-sm px-3 text-sm font-semibold transition-colors ${
                difficulty === o.value ? 'bg-nav-active text-text' : 'text-soft hover:text-text'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {visible.length} of {items.length}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={allOpen}
            onClick={toggleAll}
            className={buttonClass.secondary}
            disabled={visible.length === 0}
          >
            {allOpen ? 'Hide all answers' : 'Show all answers'}
          </button>
          <button
            type="button"
            onClick={() => setOrder(shuffled(items.length))}
            className={buttonClass.secondary}
          >
            <Shuffle aria-hidden className="size-4" />
            Shuffle
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border-2 border-dashed border-dash px-6 py-8 text-center text-muted">
          No questions match these filters.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {visible.map(({ q, answer }, n) => {
            const isOpen = open.has(q.slug);
            return (
              <li key={q.slug} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <div className="flex gap-3">
                  <span className="shrink-0 font-heading font-bold text-(--tc)">Q{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h3 id={q.slug} className="scroll-mt-24 text-lg">
                      {q.question}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <DifficultyChip difficulty={q.difficulty} />
                      {q.companies.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={company === c}
                          onClick={() => setCompany(company === c ? 'all' : c)}
                          className="inline-flex min-h-8 items-center rounded-full border border-border bg-panel px-2.5 text-xs font-semibold text-soft hover:text-text"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`${q.slug}-answer`}
                      onClick={() => toggle(q.slug)}
                      className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-text underline-offset-4 hover:underline print:hidden"
                    >
                      {isOpen ? 'Hide answer' : 'Show answer'}
                    </button>
                    <div id={`${q.slug}-answer`} className={isOpen ? 'mt-2' : 'hidden print:block'}>
                      {answer}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
