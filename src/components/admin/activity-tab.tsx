'use client';

import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { planRevert, type ChangeStatus, type Plan } from '@/lib/admin/plan';
import type { CommitDetail, CommitSummary, FileStatus } from '@/lib/github/client';
import { useAdmin } from './admin-context';
import { ChangeList } from './change-panels';
import { formatClock, formatDateTime } from './format';
import { SiteStatus } from './site-status';
import { Toast, type ToastData } from './toast';

const PER_PAGE = 20;

const LETTER: Record<FileStatus, ChangeStatus> = {
  added: 'A',
  copied: 'A',
  modified: 'M',
  changed: 'M',
  unchanged: 'M',
  renamed: 'R',
  removed: 'D',
};

const LETTER_CLASS: Record<ChangeStatus, string> = {
  A: 'text-added',
  M: 'text-modified',
  R: 'text-renamed',
  D: 'text-deleted',
};

const isContent = (path?: string) => Boolean(path?.startsWith('content/'));

function CommitRow({
  commit,
  highlighted,
  onReverted,
}: {
  commit: CommitSummary;
  highlighted: boolean;
  onReverted(message: string): void;
}) {
  const { client, view, applyCommit, handleError } = useAdmin();
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesId = useId();

  useEffect(() => {
    let cancelled = false;
    client
      .commitDetail(commit.sha)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, commit.sha]);

  const files = detail?.files.filter((f) => isContent(f.path) || isContent(f.previousPath)) ?? [];

  async function prepareRevert() {
    if (!detail?.parents[0]) return;
    setError(null);
    try {
      const parent = await client.treeAt(detail.parents[0]);
      setConfirming(planRevert(view, detail, parent));
    } catch (e) {
      setError(handleError(e));
    }
  }

  async function revert() {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.commit(confirming);
      applyCommit(result);
      setConfirming(null);
      onReverted(`Reverted ${commit.sha.slice(0, 7)} (${result.commitSha.slice(0, 7)})`);
    } catch (e) {
      setError(handleError(e));
    } finally {
      setBusy(false);
    }
  }

  const subject = commit.message.split('\n')[0];
  return (
    <li
      className={`rounded-lg border p-4 ${highlighted ? 'border-renamed bg-nav-active' : 'border-border bg-surface'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <code className="font-mono text-xs text-muted">{commit.sha.slice(0, 7)}</code>
        <span className="min-w-0 flex-1 font-semibold">{subject}</span>
        {highlighted && (
          <span className="rounded-full border border-renamed px-2 py-0.5 text-xs font-semibold text-renamed">
            Pushed now
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {commit.author} ·{' '}
        {commit.date
          ? `${formatDateTime(commit.date)} ${formatClock(Date.parse(commit.date))}`
          : ''}{' '}
        · {detail ? `${files.length} file${files.length === 1 ? '' : 's'}` : '... files'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={filesId}
          onClick={() => setOpen(!open)}
          className={buttonClass.ghost}
        >
          {open ? (
            <ChevronDown aria-hidden className="size-4" />
          ) : (
            <ChevronRight aria-hidden className="size-4" />
          )}
          {open ? 'Hide changes' : 'Show changes'}
        </button>
        {detail && detail.parents.length > 0 && files.length > 0 && !confirming && (
          <button type="button" onClick={() => void prepareRevert()} className={buttonClass.ghost}>
            <RotateCcw aria-hidden className="size-4" />
            Revert
          </button>
        )}
      </div>
      <ul id={filesId} hidden={!open} className="mt-2 space-y-1 font-mono text-xs">
        {files.map((f) => {
          const letter = LETTER[f.status];
          return (
            <li key={`${f.status}:${f.path}`} className="flex gap-2">
              <span className={`w-3 font-bold ${LETTER_CLASS[letter]}`} title={f.status}>
                {letter}
                <span className="sr-only"> ({f.status})</span>
              </span>
              <span className="break-all text-soft">
                {f.previousPath ? `${f.previousPath} → ` : ''}
                {f.path}
              </span>
            </li>
          );
        })}
      </ul>
      {confirming && (
        <div
          role="group"
          aria-label={`Revert ${commit.sha.slice(0, 7)}`}
          className="mt-3 space-y-3 rounded-md border border-deleted p-3"
        >
          <p className="text-sm font-semibold">
            Revert this commit? One new commit puts these files back as they were before it:
          </p>
          <ChangeList rows={confirming.rows} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void revert()}
              disabled={busy}
              className={`${buttonClass.primary} disabled:opacity-50`}
            >
              {busy ? 'Pushing...' : 'Revert'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className={buttonClass.secondary}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-deleted">
          {error}
        </p>
      )}
    </li>
  );
}

/** Commits on the branch that touch content/, newest first, with their files and Revert. */
export function ActivityTab() {
  const { client, pushed, sections, handleError } = useAdmin();
  const [filter, setFilter] = useState('content');
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const filterId = useId();
  const pushedShas = useMemo(() => new Set(pushed.map((p) => p.sha)), [pushed]);

  const fetchPage = useCallback(
    (next: number) => client.listCommits({ path: filter, page: next, perPage: PER_PAGE }),
    [client, filter],
  );

  // Reload when the filter changes or a new commit is pushed.
  useEffect(() => {
    let cancelled = false;
    fetchPage(1).then(
      (result) => {
        if (cancelled) return;
        setCommits(result.commits);
        setHasMore(result.hasMore);
        setPage(1);
        setError(null);
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
  }, [fetchPage, handleError, pushed.length]);

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

  // GitHub can list a new commit a moment late; show this session's pushes at the top meanwhile.
  const listed = new Set(commits.map((c) => c.sha));
  const missing =
    filter === 'content'
      ? pushed
          .filter((p) => !listed.has(p.sha))
          .map((p) => ({ sha: p.sha, message: p.message, author: 'You', date: p.date }))
      : [];
  const shown = [...missing, ...commits];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="activity-title" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="activity-title" className="text-2xl font-bold">
              Activity
            </h1>
            <p className="mt-1 text-sm text-soft">Commits that change content/, newest first.</p>
          </div>
          <div>
            <label
              htmlFor={filterId}
              className="text-xs font-semibold tracking-wider text-muted uppercase"
            >
              Section
            </label>
            <select
              id={filterId}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setCommits([]);
                setLoading(true);
              }}
              className="mt-1 block min-h-11 rounded-md border border-border bg-surface px-3 text-text"
            >
              <option value="content">All sections</option>
              {sections.map((s) => (
                <option key={s.slug} value={`content/${s.slug}`}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-deleted bg-surface p-4">
            {error}
          </p>
        )}
        {!loading && shown.length === 0 && !error && (
          <p className="mt-6 rounded-lg border-2 border-dashed border-dash px-6 py-10 text-center text-muted">
            No content commits yet.
          </p>
        )}
        <ol className="mt-6 space-y-3">
          {shown.map((commit) => (
            <CommitRow
              key={commit.sha}
              commit={commit}
              highlighted={pushedShas.has(commit.sha)}
              onReverted={(message) => setToast({ id: Date.now(), message })}
            />
          ))}
        </ol>
        {loading && <p className="mt-4 text-sm text-muted">Loading commits...</p>}
        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => void showOlder()}
            className={`${buttonClass.secondary} mt-4`}
          >
            Show older commits
          </button>
        )}
      </section>

      <aside
        aria-label="About activity"
        className="h-fit space-y-5 rounded-lg border border-border bg-surface p-4 text-sm"
      >
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Site status</h2>
          <SiteStatus />
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            This session
          </h2>
          <p className="mt-1">
            {pushed.length} commit{pushed.length === 1 ? '' : 's'} pushed
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Colours</h2>
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            <li>
              <span className="font-bold text-added">A</span> added
            </li>
            <li>
              <span className="font-bold text-modified">M</span> modified
            </li>
            <li>
              <span className="font-bold text-renamed">R</span> renamed
            </li>
            <li>
              <span className="font-bold text-deleted">D</span> deleted
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Backups</h2>
          <p className="mt-1 text-soft">
            Every change is a commit, so GitHub keeps the full history and any version can be
            restored or reverted. The nightly mirror copies the repository elsewhere when it is set
            up.
          </p>
        </div>
      </aside>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
