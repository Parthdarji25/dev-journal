'use client';

import {
  ArrowDown,
  ArrowUp,
  FolderPen,
  GripVertical,
  History,
  Pencil,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FormatBadge } from '@/components/ui/chip';
import { buttonClass } from '@/components/ui/styles';
import { allPass } from '@/lib/admin/checks';
import { toEditorDoc } from '@/lib/admin/document';
import {
  courseConfigPath,
  courseFolder,
  fileName,
  isPerTrackFile,
  itemFolder,
  listItems,
  trackFolder,
  type ItemRef,
} from '@/lib/admin/paths';
import {
  chapterOrder,
  coursePages,
  defaultMessage,
  findBrokenLinkFixes,
  findLinkFixes,
  planDelete,
  planDeleteCourse,
  planRename,
  planRenameCourse,
  planReorder,
  planUndo,
  renameTarget,
  type LinkRef,
  type Plan,
} from '@/lib/admin/plan';
import { humanize, slugify } from '@/lib/content/slug';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { ChangeList } from './change-panels';
import { HistoryPanel } from './history-panel';
import { LinkNotice, useLinkRefs } from './link-notice';
import type { ToastData } from './toast';

interface Props {
  section: SectionSlug;
  sectionName: string;
  track: string;
  trackName: string;
  course?: string;
  /** Title of the selected course (Learning Notes). */
  courseTitle?: string;
  onNew(): void;
  onNewCourse(): void;
  onEdit(path: string): void;
  /** The selected course moved to another folder (rename, or its undo). */
  onCourseRenamed(course: string): void;
  showToast(message: string, action?: ToastData['action']): void;
}

type RowMode = 'view' | 'rename' | 'delete' | 'history';

const dangerButton =
  'inline-flex min-h-11 items-center gap-2 rounded-md bg-deleted px-4 font-semibold text-bg hover:opacity-90 disabled:opacity-50';
const dangerGhost =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 font-semibold text-deleted transition-colors hover:bg-nav-active';
const arrowButton =
  'inline-flex size-11 items-center justify-center rounded-md text-soft transition-colors hover:bg-nav-active hover:text-text disabled:opacity-30 disabled:hover:bg-transparent';

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

/** Links outside a course that point at the course page or its chapters. */
function useCourseLinkRefs(track: string, course: string) {
  const { view } = useAdmin();
  const [refs, setRefs] = useState<LinkRef[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const folder = courseFolder(track, course);
    void findLinkFixes(view, coursePages(view, track, course), (p) => p.startsWith(`${folder}/`))
      .then((r) => !cancelled && setRefs(r.refs))
      .catch(() => !cancelled && setRefs([]));
    return () => {
      cancelled = true;
    };
  }, [view, track, course]);
  return refs;
}

function RenameRow({ item, props, onClose }: { item: ItemRef; props: Props; onClose(): void }) {
  const { view, client, applyCommit, handleError } = useAdmin();
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
      applyCommit(result);
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
  const { view, client, applyCommit, handleError } = useAdmin();
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
      applyCommit(result);
      onClose();
      props.showToast(`Deleted ${item.fileName} (${result.commitSha.slice(0, 7)})`, {
        label: 'Undo',
        run: () => {
          void (async () => {
            try {
              const undo = await client.commit(
                planUndo(result, defaultMessage(props.section, 'restore', item.fileName)),
              );
              applyCommit(undo);
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
          className={dangerButton}
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

interface CoursePanelProps {
  track: string;
  course: string;
  name: string;
  onClose(): void;
  showToast: Props['showToast'];
}

function RenameCoursePanel({
  track,
  course,
  name,
  onClose,
  onRenamed,
  showToast,
}: CoursePanelProps & { onRenamed(course: string): void }) {
  const { view, client, applyCommit, handleError } = useAdmin();
  const [newName, setNewName] = useState(name);
  const [setTitle, setSetTitle] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useCourseLinkRefs(track, course);
  const ids = { name: useId(), title: useId() };
  const slug = slugify(newName.trim());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void planRenameCourse(view, { track, course, newName, setTitle })
        .then((p) => !cancelled && setPlan(p))
        .catch(() => !cancelled && setPlan(null));
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, track, course, newName, setTitle]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const final = await planRenameCourse(view, { track, course, newName, setTitle });
      if (!allPass(final.checks)) return;
      const result = await client.commit(final);
      applyCommit(result);
      const moved = fileName(final.path);
      onClose();
      onRenamed(moved);
      showToast(`Renamed the course to ${newName.trim()} (${result.commitSha.slice(0, 7)})`, {
        label: 'Undo',
        run: () => {
          void (async () => {
            try {
              const undo = await client.commit(
                planUndo(result, `docs(learning-notes): undo rename of course ${course}`),
              );
              applyCommit(undo);
              onRenamed(course);
              showToast(`Undid the course rename (${undo.commitSha.slice(0, 7)})`);
            } catch (e) {
              showToast(handleError(e));
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

  const failing = plan?.checks.filter((c) => !c.ok && c.id !== 'changed') ?? [];
  const ready = Boolean(plan && allPass(plan.checks));
  return (
    <div
      role="group"
      aria-label={`Rename the course ${name}`}
      className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div>
        <label htmlFor={ids.name} className="text-sm font-semibold">
          New course name
        </label>
        <input
          id={ids.name}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
          autoComplete="off"
          className="mt-1 min-h-11 w-full max-w-xl rounded-md border border-border bg-bg px-3 text-text"
        />
        <p className="mt-1 font-mono text-xs break-all text-muted" aria-live="polite">
          {courseFolder(track, course)}/ → {courseFolder(track, slug || '...')}/
        </p>
        {failing.map((c) => (
          <p key={c.id} className="mt-1 text-sm text-deleted">
            {c.detail ?? c.label}
          </p>
        ))}
      </div>
      <label htmlFor={ids.title} className="flex min-h-11 items-center gap-2 text-sm">
        <input
          id={ids.title}
          type="checkbox"
          checked={setTitle}
          onChange={(e) => setSetTitle(e.target.checked)}
          className="size-4"
        />
        Also use it as the course title
      </label>
      {plan && ready && <ChangeList rows={plan.rows} />}
      <LinkNotice refs={refs} verb="move" />
      {error && (
        <p role="alert" className="text-sm text-deleted">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !ready || refs === null}
          className={`${buttonClass.primary} disabled:opacity-50`}
        >
          {busy ? 'Pushing...' : 'Rename course'}
        </button>
        <button type="button" onClick={onClose} className={buttonClass.secondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeleteCoursePanel({
  track,
  course,
  name,
  chapters,
  onClose,
  showToast,
}: CoursePanelProps & { chapters: number }) {
  const { view, client, applyCommit, handleError } = useAdmin();
  const [typed, setTyped] = useState('');
  const [fix, setFix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const refs = useCourseLinkRefs(track, course);
  const inputId = useId();
  const folder = courseFolder(track, course);

  useEffect(() => {
    let cancelled = false;
    void planDeleteCourse(view, { track, course }).then((p) => !cancelled && setPreview(p));
    return () => {
      cancelled = true;
    };
  }, [view, track, course]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const fixes =
        fix && refs?.length
          ? (
              await findLinkFixes(view, coursePages(view, track, course), (p) =>
                p.startsWith(`${folder}/`),
              )
            ).fixes
          : undefined;
      const result = await client.commit(
        await planDeleteCourse(view, { track, course, linkFixes: fixes }),
      );
      applyCommit(result);
      onClose();
      showToast(`Deleted the course ${name} (${result.commitSha.slice(0, 7)})`, {
        label: 'Undo',
        run: () => {
          void (async () => {
            try {
              const undo = await client.commit(
                planUndo(result, `docs(learning-notes): restore course ${course}`),
              );
              applyCommit(undo);
              showToast(`Restored the course ${name} (${undo.commitSha.slice(0, 7)})`);
            } catch (e) {
              showToast(handleError(e));
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
      aria-label={`Delete the course ${name}`}
      className="mt-6 space-y-3 rounded-lg border border-deleted bg-surface p-4"
    >
      <p className="font-semibold">
        Delete the course &ldquo;{name}&rdquo; with its {chapters} chapter
        {chapters === 1 ? '' : 's'} and every file in{' '}
        <code className="font-mono text-xs">{folder}/</code>? This makes one commit, and you can
        undo it right after.
      </p>
      {preview && <ChangeList rows={preview.rows} />}
      <LinkNotice refs={refs} fix={fix} setFix={setFix} verb="delete" />
      <div>
        <label htmlFor={inputId} className="text-sm font-semibold">
          Type the course name, {name}, to confirm
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mt-1 min-h-11 w-full max-w-md rounded-md border border-border bg-bg px-3 text-text"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-deleted">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy || refs === null || typed.trim() !== name}
          className={dangerButton}
        >
          <Trash2 aria-hidden className="size-4" />
          {busy ? 'Pushing...' : 'Delete course'}
        </button>
        <button type="button" onClick={onClose} className={buttonClass.secondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** `order` limited to the files present, then any present file it does not list. */
function reconcile(order: string[], present: string[]): string[] {
  const listed = order.filter((f) => present.includes(f));
  return [...listed, ...present.filter((f) => !listed.includes(f))];
}

/**
 * Chapter order of a course: the saved order from _course.json, and a local
 * order the author changes by drag-and-drop or the move buttons until saving.
 */
function useChapterOrder(track: string, course: string | undefined, items: ItemRef[]) {
  const { view, snapshot } = useAdmin();
  const [saved, setSaved] = useState<{ sha: string; order: string[] } | null>(null);
  const [local, setLocal] = useState<string[] | null>(null);

  useEffect(() => {
    if (!course || saved?.sha === snapshot.commitSha) return;
    let cancelled = false;
    const sha = snapshot.commitSha;
    void chapterOrder(view, track, course)
      .then((order) => !cancelled && setSaved({ sha, order }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, track, course, snapshot.commitSha, saved?.sha]);

  const present = items.map((i) => i.fileName);
  const savedOrder = saved ? reconcile(saved.order, present) : present;
  const order = local ? reconcile(local, present) : savedOrder;
  return {
    order,
    /** The saved order is known for the current snapshot (moves are allowed). */
    ready: saved !== null,
    changed: local !== null && saved?.sha === snapshot.commitSha && !sameList(order, savedOrder),
    setLocal,
    /** Records an order just committed, without reading _course.json again. */
    markSaved(sha: string, committed: string[]) {
      setSaved({ sha, order: committed });
      setLocal(null);
    },
  };
}

export function ItemList(props: Props) {
  const { snapshot, view, client, applyCommit, handleError } = useAdmin();
  const { section, sectionName, track, trackName, course } = props;
  const [mode, setMode] = useState<{ path: string; row: RowMode } | null>(null);
  const [coursePanel, setCoursePanel] = useState<'rename' | 'delete' | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement & HTMLUListElement>(null);
  const focusAfterMove = useRef<{ file: string; dir: 'up' | 'down' } | null>(null);
  const items = useMemo(
    () => listItems(snapshot.files, section, track, course),
    [snapshot.files, section, track, course],
  );
  const titles = useTitles(section, track, course, items);
  const isCourse = section === 'learning-notes' && Boolean(course);
  const chapters = useChapterOrder(track, isCourse ? course : undefined, items);
  const perTrack = isPerTrackFile(section);
  const needsCourse = section === 'learning-notes' && !course;
  const folder = needsCourse ? trackFolder(section, track) : itemFolder(section, track, course);
  const canAdd = !needsCourse && !(perTrack && items.length > 0);
  const canReorder = isCourse && items.length > 1 && chapters.ready;
  const byName = new Map(items.map((i) => [i.fileName, i]));
  const rows = isCourse
    ? chapters.order.map((f) => byName.get(f)).filter((i): i is ItemRef => i !== undefined)
    : items;

  // A moved row can lose focus when the list re-renders; keep it on its arrow.
  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-move]');
    const own = [...(buttons ?? [])].filter((b) => b.dataset.file === target.file);
    const button =
      own.find((b) => b.dataset.move === target.dir && !b.disabled) ?? own.find((b) => !b.disabled);
    button?.focus();
  }, [chapters.order]);

  function moveTo(file: string, to: number) {
    const from = chapters.order.indexOf(file);
    if (from < 0 || to < 0 || to >= chapters.order.length || from === to) return;
    const next = [...chapters.order];
    next.splice(from, 1);
    next.splice(to, 0, file);
    chapters.setLocal(next);
    setOrderError(null);
    setAnnouncement(`Moved ${file} to position ${to + 1} of ${next.length}.`);
  }

  async function saveOrder() {
    if (!course) return;
    const order = chapters.order;
    setOrderBusy(true);
    setOrderError(null);
    try {
      const plan = await planReorder(view, { track, course, order });
      if (!allPass(plan.checks)) {
        setOrderError('The chapters changed while you were sorting them. Reset and try again.');
        return;
      }
      const result = await client.commit(plan);
      applyCommit(result);
      chapters.markSaved(result.commitSha, order);
      setAnnouncement('Chapter order saved.');
      props.showToast(`Saved the chapter order (${result.commitSha.slice(0, 7)})`, {
        label: 'Undo',
        run: () => {
          void (async () => {
            try {
              const undo = await client.commit(
                planUndo(result, `docs(learning-notes): undo reorder of ${course}`),
              );
              applyCommit(undo);
              props.showToast(`Restored the previous order (${undo.commitSha.slice(0, 7)})`);
            } catch (e) {
              props.showToast(handleError(e));
            }
          })();
        },
      });
    } catch (e) {
      setOrderError(handleError(e));
    } finally {
      setOrderBusy(false);
    }
  }

  const courseName = props.courseTitle || course || '';
  const List = isCourse ? 'ol' : 'ul';
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{sectionName}</h1>
          <p className="mt-1 text-sm text-soft">
            {trackName} · <code className="font-mono text-xs text-muted">{folder}/</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isCourse && !coursePanel && (
            <>
              <button
                type="button"
                onClick={() => setCoursePanel('rename')}
                className={buttonClass.ghost}
              >
                <FolderPen aria-hidden className="size-4" />
                Rename course
              </button>
              <button
                type="button"
                onClick={() => setCoursePanel('delete')}
                className={dangerGhost}
              >
                <Trash2 aria-hidden className="size-4" />
                Delete course
              </button>
            </>
          )}
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
      </div>

      {isCourse && course && coursePanel === 'rename' && (
        <RenameCoursePanel
          key={course}
          track={track}
          course={course}
          name={courseName}
          onClose={() => setCoursePanel(null)}
          onRenamed={props.onCourseRenamed}
          showToast={props.showToast}
        />
      )}
      {isCourse && course && coursePanel === 'delete' && (
        <DeleteCoursePanel
          key={course}
          track={track}
          course={course}
          name={courseName}
          chapters={items.length}
          onClose={() => setCoursePanel(null)}
          showToast={props.showToast}
        />
      )}

      {isCourse && items.length > 1 && (
        <p className="mt-4 text-sm text-muted">
          Chapters are listed in reading order. Drag a chapter, or use its arrows, to move it.
        </p>
      )}
      {chapters.changed && (
        <div
          role="group"
          aria-label="Chapter order"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-modified bg-surface p-3"
        >
          <p className="text-sm font-semibold">
            The order changed. Saving writes it to _course.json in one commit.
          </p>
          <button
            type="button"
            onClick={() => void saveOrder()}
            disabled={orderBusy}
            className={`${buttonClass.primary} disabled:opacity-50`}
          >
            {orderBusy ? 'Pushing...' : 'Save order'}
          </button>
          <button
            type="button"
            onClick={() => {
              chapters.setLocal(null);
              setOrderError(null);
              setAnnouncement('Chapter order reset.');
            }}
            disabled={orderBusy}
            className={buttonClass.secondary}
          >
            Reset
          </button>
          {orderError && (
            <p role="alert" className="w-full text-sm text-deleted">
              {orderError}
            </p>
          )}
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

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
        <List
          ref={listRef}
          aria-label={isCourse ? 'Chapters in reading order' : undefined}
          className="mt-6 space-y-2"
        >
          {rows.map((item, index) => {
            const row = mode?.path === item.path ? mode.row : 'view';
            const close = () => setMode(null);
            const open = (next: RowMode) => setMode({ path: item.path, row: next });
            const dropTarget =
              dragging !== null && dragging !== item.fileName && dropIndex === index;
            return (
              <li key={item.path}>
                {row === 'rename' ? (
                  <RenameRow item={item} props={props} onClose={close} />
                ) : row === 'delete' ? (
                  <DeleteRow item={item} props={props} onClose={close} />
                ) : row === 'history' ? (
                  <HistoryPanel
                    item={item}
                    section={section}
                    onClose={close}
                    showToast={props.showToast}
                  />
                ) : (
                  <div
                    draggable={canReorder && !orderBusy}
                    onDragStart={(e) => {
                      setDragging(item.fileName);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.fileName);
                    }}
                    onDragOver={(e) => {
                      if (dragging === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropIndex(index);
                    }}
                    onDrop={(e) => {
                      if (dragging === null) return;
                      e.preventDefault();
                      moveTo(dragging, index);
                      setDragging(null);
                      setDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropIndex(null);
                    }}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-2 ${
                      dropTarget ? 'border-text' : 'border-border'
                    } ${dragging === item.fileName ? 'opacity-50' : ''}`}
                  >
                    {canReorder && (
                      <GripVertical
                        aria-hidden
                        className="size-4 shrink-0 cursor-grab text-muted"
                      />
                    )}
                    {isCourse && (
                      <span className="w-5 text-right font-mono text-xs text-muted">
                        {index + 1}
                      </span>
                    )}
                    <FormatBadge format={item.format} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {titles[item.path] ?? item.fileName}
                      </span>
                      <span className="block font-mono text-xs text-muted">{item.fileName}</span>
                    </span>
                    {canReorder && (
                      <span className="flex">
                        <button
                          type="button"
                          data-move="up"
                          data-file={item.fileName}
                          aria-label={`Move ${item.fileName} up`}
                          disabled={orderBusy || index === 0}
                          onClick={() => {
                            focusAfterMove.current = { file: item.fileName, dir: 'up' };
                            moveTo(item.fileName, index - 1);
                          }}
                          className={arrowButton}
                        >
                          <ArrowUp aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          data-move="down"
                          data-file={item.fileName}
                          aria-label={`Move ${item.fileName} down`}
                          disabled={orderBusy || index === rows.length - 1}
                          onClick={() => {
                            focusAfterMove.current = { file: item.fileName, dir: 'down' };
                            moveTo(item.fileName, index + 1);
                          }}
                          className={arrowButton}
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </button>
                      </span>
                    )}
                    <span className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => props.onEdit(item.path)}
                        className={buttonClass.ghost}
                      >
                        <Pencil aria-hidden className="size-4" />
                        Edit<span className="sr-only"> {item.fileName}</span>
                      </button>
                      {!perTrack && (
                        <button
                          type="button"
                          onClick={() => open('rename')}
                          className={buttonClass.ghost}
                        >
                          <Type aria-hidden className="size-4" />
                          Rename<span className="sr-only"> {item.fileName}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => open('history')}
                        className={buttonClass.ghost}
                      >
                        <History aria-hidden className="size-4" />
                        History<span className="sr-only"> of {item.fileName}</span>
                      </button>
                      <button type="button" onClick={() => open('delete')} className={dangerGhost}>
                        <Trash2 aria-hidden className="size-4" />
                        Delete<span className="sr-only"> {item.fileName}</span>
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </List>
      )}
    </div>
  );
}
