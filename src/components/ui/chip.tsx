import type { ReactNode } from 'react';
import type { Difficulty } from '@/lib/schema';

const base =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

/** Neutral label chip. */
export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`${base} border-border bg-surface text-soft ${className}`}>{children}</span>
  );
}

/** Chip in the colour of the enclosing track scope (.t-<slug>). */
export function TrackChip({ children }: { children: ReactNode }) {
  return <span className={`${base} border-(--tc) bg-(--tt) text-(--tc)`}>{children}</span>;
}

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  easy: 'text-added',
  medium: 'text-modified',
  hard: 'text-deleted',
};

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`${base} border-current bg-surface ${DIFFICULTY_CLASS[difficulty]}`}>
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </span>
  );
}

/** MD / HTML badge for chapter and map lists. */
export function FormatBadge({ format }: { format: 'md' | 'html' }) {
  return (
    <span className="inline-flex w-11 shrink-0 justify-center rounded-sm border border-border bg-panel py-0.5 font-mono text-[11px] font-semibold text-soft">
      {format.toUpperCase()}
    </span>
  );
}
