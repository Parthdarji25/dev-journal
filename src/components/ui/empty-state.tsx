import type { ReactNode } from 'react';

/** Dashed rounded box with centred muted text, e.g. "System Design questions are coming soon." */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-dash px-6 py-10 text-center text-muted">
      {children}
    </div>
  );
}
