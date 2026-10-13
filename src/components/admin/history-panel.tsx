'use client';

import { History, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { allPass } from '@/lib/admin/checks';
import { fromEditorDoc, todayIso, toEditorDoc } from '@/lib/admin/document';
import type { ItemRef } from '@/lib/admin/paths';
import { planRestore, planUndo } from '@/lib/admin/plan';
import type { CommitSummary } from '@/lib/github/client';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { formatClock, formatDateTime } from './format';
import type { ToastData } from './toast';

const PER_PAGE = 10;

/**
 * The commits that changed one file (GitHub's commits API with a path), each
 * with Restore: the older content is written back as a new commit.
 */
export function HistoryPanel({
  item,
  section,
  onClose,
  showToast,
}: {
  item: ItemRef;
  section: SectionSlug;
  onClose(): void;
  showToast(message: string, action?: ToastData['action']): void;
}) {
  const { client, view, applyCommit, handleError } = useAdmin();
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (next: number) => client.listCommits({ path: item.path, page: next, perPage: PER_PAGE }),
    [client, item.path],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(1).then(
      (result) => {
        if (cancelled) return;
        setCommits(result.commits);
        setHasMore(result.hasMore);
        setPage(1);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(handleError(e));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, handleError]);

  async function showOlder() {
    setLoading(true);
    try {
      const result = await fetchPage(page + 1);
      setCommits((list) => [...list, ...result.commits]);
      setHasMore(result.hasMore);
      setPage(page + 1);
    } catch (e) {
      setError(handleError(e));
    } finally {
      setLoading(false);
    }
  }

  async function restore(commit: CommitSummary) {
    setBusy(commit.sha);
    setError(null);
    try {
      const old = (await client.treeAt(commit.sha)).get(item.path);
      if (!old) {
        setError(`${item.fileName} did not exist under this name in ${commit.sha.slice(0, 7)}.`);
        return;
      }
      const today = todayIso();
      // Markdown gets today's updated date, as on every save; HTML is restored byte for byte.
      let text: string | undefined;
      if (item.format === 'md') {
        const oldText = await client.readText(old.sha);
        try {
          text = fromEditorDoc(section, toEditorDoc(section, oldText), today);
        } catch {
          // Front-matter that does not parse: put the old file back exactly as it was.
          text = undefined;
        }
      }
      const plan = await planRestore(view, {
        section,
        path: item.path,
        sha: old.sha,
        text,
        from: commit.sha.slice(0, 7),
        today,
      });
      if (!allPass(plan.checks)) {
        setError('This version is the same as the current one.');
        return;
      }
      const result = await client.commit(plan);
      applyCommit(result);
      onClose();
      showToast(
        `Restored ${item.fileName} from ${commit.sha.slice(0, 7)} (${result.commitSha.slice(0, 7)})`,
        {
          label: 'Undo',
          run: () => {
            void (async () => {
              try {
                const undo = await client.commit(
                  planUndo(result, `docs(${section}): undo restore of ${item.fileName}`),
                );
                applyCommit(undo);
                showToast(`Undid the restore of ${item.fileName}`);
              } catch (e) {
                showToast(handleError(e));
              }
            })();
          },
        },
      );
    } catch (e) {
      setError(handleError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="group"
      aria-label={`History of ${item.fileName}`}
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <History aria-hidden className="size-4" />
          History of {item.fileName}
        </p>
        <button type="button" onClick={onClose} className={buttonClass.ghost}>
          Close
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-deleted">
          {error}
        </p>
      )}
      <ol className="divide-y divide-border">
        {commits.map((commit, index) => (
          <li key={commit.sha} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <code className="font-mono text-xs text-muted">{commit.sha.slice(0, 7)}</code>
            <span className="min-w-0 flex-1 text-sm">{commit.message.split('\n')[0]}</span>
            <span className="text-xs text-muted">
              {commit.date
                ? `${formatDateTime(commit.date)} ${formatClock(Date.parse(commit.date))}`
                : ''}
            </span>
            {index === 0 && page === 1 ? (
              <span className="text-xs font-semibold text-muted">Current version</span>
            ) : (
              <button
                type="button"
                onClick={() => void restore(commit)}
                disabled={busy !== null}
                className={`${buttonClass.ghost} disabled:opacity-50`}
              >
                <RotateCcw aria-hidden className="size-4" />
                {busy === commit.sha ? 'Pushing...' : 'Restore'}
                <span className="sr-only"> the version from {commit.sha.slice(0, 7)}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      {loading && <p className="text-sm text-muted">Loading the history...</p>}
      {!loading && commits.length === 0 && (
        <p className="text-sm text-muted">No commits found for this file yet.</p>
      )}
      {hasMore && !loading && (
        <button type="button" onClick={() => void showOlder()} className={buttonClass.secondary}>
          Show older versions
        </button>
      )}
    </div>
  );
}
