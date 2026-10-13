import { Check as CheckIcon, X } from 'lucide-react';
import type { Check } from '@/lib/admin/checks';
import type { ChangeRow, ChangeStatus } from '@/lib/admin/plan';
import { formatBytes } from './format';

const STATUS: Record<ChangeStatus, { label: string; className: string }> = {
  A: { label: 'added', className: 'text-added' },
  M: { label: 'modified', className: 'text-modified' },
  R: { label: 'renamed', className: 'text-renamed' },
  D: { label: 'deleted', className: 'text-deleted' },
};

/** Files of one commit with A/M/R/D letters; sizes are information only. */
export function ChangeList({ rows }: { rows: ChangeRow[] }) {
  return (
    <ul className="space-y-1 font-mono text-xs">
      {rows.map((row) => (
        <li key={`${row.status}:${row.path}`} className="flex items-start gap-2">
          <span
            className={`w-3 shrink-0 font-bold ${STATUS[row.status].className}`}
            title={STATUS[row.status].label}
          >
            {row.status}
            <span className="sr-only"> ({STATUS[row.status].label})</span>
          </span>
          <span className="min-w-0 flex-1 break-all text-soft">
            {row.from && (
              <>
                {row.from}
                <span aria-hidden> → </span>
                <span className="sr-only"> to </span>
              </>
            )}
            {row.path}
          </span>
          {row.size !== undefined && (
            <span className="shrink-0 text-muted">{formatBytes(row.size)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Pass/fail list; failing checks explain why. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2">
          {c.ok ? (
            <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-added" />
          ) : (
            <X aria-hidden className="mt-0.5 size-4 shrink-0 text-deleted" />
          )}
          <span>
            <span className="sr-only">{c.ok ? 'Pass: ' : 'Fail: '}</span>
            {c.label}
            {!c.ok && c.detail && <span className="block text-xs text-deleted">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
