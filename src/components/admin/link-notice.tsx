'use client';

import { useEffect, useId, useState } from 'react';
import { findBrokenLinkFixes, type LinkRef } from '@/lib/admin/plan';
import { useAdmin } from './admin-context';

/** Links elsewhere that point at `path`, looked up once when a rename or delete opens. */
export function useLinkRefs(path: string) {
  const { view } = useAdmin();
  const [refs, setRefs] = useState<LinkRef[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void findBrokenLinkFixes(view, path, path)
      .then((r) => !cancelled && setRefs(r.refs))
      .catch(() => !cancelled && setRefs([]));
    return () => {
      cancelled = true;
    };
  }, [view, path]);
  return refs;
}

/** "N links point here", with the choice to fix them in the same commit (when given). */
export function LinkNotice({
  refs,
  fix,
  setFix,
  verb,
}: {
  refs: LinkRef[] | null;
  fix?: boolean;
  setFix?(value: boolean): void;
  verb: 'rename' | 'delete' | 'move';
}) {
  const id = useId();
  if (refs === null) return <p className="text-sm text-muted">Checking which pages link here...</p>;
  if (refs.length === 0) return <p className="text-sm text-muted">No other page links here.</p>;
  return (
    <div className="text-sm">
      <p className="font-semibold text-text">
        {refs.length} {refs.length === 1 ? 'link points' : 'links point'} here
        {verb === 'move' ? ' and will be updated in the same commit:' : ':'}
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
        {refs.map((r) => (
          <li key={`${r.file}:${r.line}:${r.url}`}>
            {r.file}:{r.line}
          </li>
        ))}
      </ul>
      {setFix && (
        <label htmlFor={id} className="mt-2 flex min-h-11 items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={fix}
            onChange={(e) => setFix(e.target.checked)}
            className="size-4"
          />
          {verb === 'rename'
            ? 'Update these links in the same commit'
            : 'Remove these links in the same commit (their text stays)'}
        </label>
      )}
    </div>
  );
}
