'use client';

import { Pencil, Plus, Trash2, Type } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { FormatBadge } from '@/components/ui/chip';
import { buttonClass } from '@/components/ui/styles';
import { allPass } from '@/lib/admin/checks';
import { toEditorDoc } from '@/lib/admin/document';
import {
  courseConfigPath,
  fileName,
  isPerTrackFile,
  itemFolder,
  listItems,
  trackFolder,
  type ItemRef,
} from '@/lib/admin/paths';
import {
  defaultMessage,
  findBrokenLinkFixes,
  planDelete,
  planRename,
  planUndo,
  renameTarget,
  type LinkRef,
  type Plan,
} from '@/lib/admin/plan';
import { humanize } from '@/lib/content/slug';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { ChangeList } from './change-panels';
import type { ToastData } from './toast';

interface Props {
  section: SectionSlug;
  sectionName: string;
  track: string;
  trackName: string;
  course?: string;
  onNew(): void;
  onNewCourse(): void;
  onEdit(path: string): void;
  showToast(message: string, action?: ToastData['action']): void;
}

type RowMode = { kind: 'view' } | { kind: 'rename' } | { kind: 'delete' };

/** Titles of the listed items: front-matter for markdown, _course.json for HTML chapters. */
function useTitles(
  section: SectionSlug,
  track: string,
  course: string | undefined,
  items: ItemRef[],
) {
  const { view } = useAdmin();
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let html: Record<string, { title?: string }> = {};
      if (section === 'learning-notes' && course && items.some((i) => i.format === 'html')) {
        try {
          html =
            (JSON.parse(await view.read(courseConfigPath(track, course))) as { html?: typeof html })
              .html ?? {};
        } catch {
          html = {};
        }
      }
      const entries = await Promise.all(
        items.map(async (item) => {
          if (item.format === 'html')
            return [item.path, html[item.fileName]?.title || humanize(item.slug)] as const;
          try {
            return [
              item.path,
              toEditorDoc(section, await view.read(item.path)).title || item.fileName,
            ] as const;
          } catch {
            return [item.path, item.fileName] as const;
          }
        }),
      );
      if (!cancelled) setTitles(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [view, section, track, course, items]);
  return titles;
}

/** Links elsewhere that point at `path`, looked up once when a rename or delete opens. */
function useLinkRefs(path: string) {
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

function LinkNotice({
  refs,
  fix,
  setFix,
  verb,
}: {
  refs: LinkRef[] | null;
  fix: boolean;
  setFix(value: boolean): void;
  verb: 'rename' | 'delete';
}) {
  const id = useId();
  if (refs === null) return <p className="text-sm text-muted">Checking which pages link here...</p>;
  if (refs.length === 0) return <p className="text-sm text-muted">No other page links here.</p>;
  return (
    <div className="text-sm">
      <p className="font-semibold text-text">
        {refs.length} link{refs.length === 1 ? '' : 's'} point here:
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
        {refs.map((r) => (
          <li key={`${r.file}:${r.line}`}>
            {r.file}:{r.line}
          </li>
        ))}
      </ul>
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
    </div>
  );
}

function RenameRow({ item, props, onClose }: { item: ItemRef; props: Props; onClose(): void }) {
  const { view, client, refresh, handleError } = useAdmin();
  const [name, setName] = useState(item.slug);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fix, setFix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useLinkRefs(item.path);
  const inputId = useId();
  const target = renameTarget(item.path, name);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void planRename(view, {
        section: props.section,
        track: props.track,
        course: props.course,
        path: item.path,
        newName: name,
      }).then((p) => !cancelled && setPlan(p));
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, name, item.path, props.section, props.track, props.course]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fixes =
        fix && refs?.length
          ? (await findBrokenLinkFixes(view, item.path, target)).fixes
          : undefined;
      const final = await planRename(view, {
        section: props.section,
        track: props.track,
        course: props.course,
        path: item.path,
        newName: name,
        linkFixes: fixes,
      });
      if (!allPass(final.checks)) return;
      const result = await client.commit(final);
      await refresh();
      onClose();
      props.showToast(
        `Renamed ${item.fileName} to ${fileName(final.path)} (${result.commitSha.slice(0, 7)})`,
      );
    } catch (e) {
      setError(handleError(e));
    } finally {
      setBusy(false);
    }
  }

  const failing = plan?.checks.filter((c) => !c.ok && c.id !== 'changed') ?? [];
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <label htmlFor={inputId} className="text-sm font-semibold">
          New name for {item.fileName}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            id={inputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-text"
          />
          <span className="font-mono text-sm text-muted" aria-live="polite">
            → {fileName(target)}
          </span>
        </div>
        {failing.map((c) => (
          <p key={c.id} className="mt-1 text-sm text-deleted">
            {c.detail ?? c.label}
          </p>
        ))}
      </div>
      <LinkNotice refs={refs} fix={fix} setFix={setFix} verb="rename" />
      {error && (
        <p role="alert" className="text-sm text-deleted">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !plan || !allPass(plan.checks) || refs === null}
          className={`${buttonClass.primary} disabled:opacity-50`}
        >
          {busy ? 'Pushing...' : 'Rename'}
        </button>
        <button type="button" onClick={onClose} className={buttonClass.secondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeleteRow({ item, props, onClose }: { item: ItemRef; props: Props; onClose(): void }) {
  const { view, client, refresh, handleError } = useAdmin();
  const [fix, setFix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const refs = useLinkRefs(item.path);

  useEffect(() => {
    let cancelled = false;
    void planDelete(view, {
      section: props.section,
      track: props.track,
      course: props.course,
      path: item.path,
    })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, item.path, props.section, props.track, props.course]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const fixes =
        fix && refs?.length ? (await findBrokenLinkFixes(view, item.path, null)).fixes : undefined;
      const plan = await planDelete(view, {
        section: props.section,
        track: props.track,
        course: props.course,
        path: item.path,
        linkFixes: fixes,
      });
      const result = await client.commit(plan);
      await refresh();
      onClose();
      props.showToast(`Deleted ${item.fileName} (${result.commitSha.slice(0, 7)})`, {
        label: 'Undo',
        run: () => {
          void (async () => {
            try {
              const undo = await client.commit(
                planUndo(result, defaultMessage(props.section, 'restore', item.fileName)),
              );
              await refresh();
              props.showToast(`Restored ${item.fileName} (${undo.commitSha.slice(0, 7)})`);
            } catch (e) {
              props.showToast(handleError(e));
            }
          })();
        },
      });
    } catch (e) {
      setError(handleError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={`Delete ${item.fileName}`}
      className="space-y-3 rounded-lg border border-deleted bg-surface p-4"
    >
      <p className="font-semibold">
        Delete {item.fileName}? This makes one commit, and you can undo it right after.
      </p>
      {preview && <ChangeList rows={preview.rows} />}
      <LinkNotice refs={refs} fix={fix} setFix={setFix} verb="delete" />
      {error && (
        <p role="alert" className="text-sm text-deleted">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy || refs === null}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-deleted px-4 font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          <Trash2 aria-hidden className="size-4" />
          {busy ? 'Pushing...' : 'Delete'}
        </button>
        <button type="button" onClick={onClose} className={buttonClass.secondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ItemList(props: Props) {
  const { snapshot } = useAdmin();
  const { section, sectionName, track, trackName, course } = props;
  const [mode, setMode] = useState<{ path: string; row: RowMode } | null>(null);
  const items = useMemo(
    () => listItems(snapshot.files, section, track, course),
    [snapshot.files, section, track, course],
  );
  const titles = useTitles(section, track, course, items);
  const perTrack = isPerTrackFile(section);
  const needsCourse = section === 'learning-notes' && !course;
  const folder = needsCourse ? trackFolder(section, track) : itemFolder(section, track, course);
  const canAdd = !needsCourse && !(perTrack && items.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{sectionName}</h1>
          <p className="mt-1 text-sm text-soft">
            {trackName} · <code className="font-mono text-xs text-muted">{folder}/</code>
          </p>
        </div>
        {canAdd && (
          <button type="button" onClick={props.onNew} className={buttonClass.primary}>
            <Plus aria-hidden className="size-4" />
            New
          </button>
        )}
        {needsCourse && (
          <button type="button" onClick={props.onNewCourse} className={buttonClass.primary}>
            <Plus aria-hidden className="size-4" />
            New course
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-lg border-2 border-dashed border-dash px-6 py-10 text-center text-muted">
          {needsCourse
            ? `${trackName} has no courses yet. Create one to write its first chapter.`
            : section === 'learning-notes'
              ? 'This course has no chapters yet. Use New to write the first one.'
              : perTrack
                ? `${trackName} has no ${sectionName.toLowerCase()} file yet. Use New to start it.`
                : `No ${sectionName.toLowerCase()} for ${trackName} yet. Use New to write the first one.`}
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((item) => {
            const row = mode?.path === item.path ? mode.row : { kind: 'view' as const };
            const close = () => setMode(null);
            return (
              <li key={item.path}>
                {row.kind === 'rename' ? (
                  <RenameRow item={item} props={props} onClose={close} />
                ) : row.kind === 'delete' ? (
                  <DeleteRow item={item} props={props} onClose={close} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2">
                    <FormatBadge format={item.format} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {titles[item.path] ?? item.fileName}
                      </span>
                      <span className="block font-mono text-xs text-muted">{item.fileName}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {item.format === 'md' && (
                        <button
                          type="button"
                          onClick={() => props.onEdit(item.path)}
                          className={buttonClass.ghost}
                        >
                          <Pencil aria-hidden className="size-4" />
                          Edit<span className="sr-only"> {item.fileName}</span>
                        </button>
                      )}
                      {!perTrack && (
                        <button
                          type="button"
                          onClick={() => setMode({ path: item.path, row: { kind: 'rename' } })}
                          className={buttonClass.ghost}
                        >
                          <Type aria-hidden className="size-4" />
                          Rename<span className="sr-only"> {item.fileName}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setMode({ path: item.path, row: { kind: 'delete' } })}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 font-semibold text-deleted transition-colors hover:bg-nav-active"
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Delete<span className="sr-only"> {item.fileName}</span>
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
