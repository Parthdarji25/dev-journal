'use client';

import matter from 'gray-matter';
import { ArrowLeft, RefreshCw, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { allPass, type Check } from '@/lib/admin/checks';
import { fromEditorDoc, todayIso, toEditorDoc } from '@/lib/admin/document';
import { loadDraft, newItemKey, removeDraft, saveDraft } from '@/lib/admin/drafts';
import { fileName } from '@/lib/admin/paths';
import { planSave, type Plan } from '@/lib/admin/plan';
import { templateFor } from '@/lib/admin/templates';
import { toGitHubError } from '@/lib/github/errors';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { ChangeList, CheckList } from './change-panels';
import { formatClock } from './format';
import { MarkdownEditor } from './markdown-editor';

interface Fields {
  title: string;
  text: string;
  courseName: string;
}

interface Loaded {
  baseline: Fields;
  /** Blob sha the commit must find on GitHub (null for a new item). */
  expectSha: string | null;
}

export interface EditorProps {
  section: SectionSlug;
  sectionName: string;
  track: string;
  course?: string;
  newCourse: boolean;
  /** Existing file; absent when creating. */
  path?: string;
  onDirtyChange(dirty: boolean): void;
  onBack(): void;
  onCommitted(message: string, course?: string): void;
  pendingLeave: boolean;
  onKeepEditing(): void;
  onDiscard(): void;
}

const same = (a: Fields, b: Fields) =>
  a.title === b.title && a.text === b.text && a.courseName === b.courseName;

function Preview({ text }: { text: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let body = text;
      try {
        body = matter(text, {}).content;
      } catch {
        // Show the raw text when the front-matter does not parse.
      }
      // The same pipeline as the site; raw HTML in markdown is dropped by it.
      const { renderMarkdown } = await import('@/lib/content/markdown/render');
      const rendered = await renderMarkdown(body);
      if (!cancelled) setHtml(rendered.html);
    })();
    return () => {
      cancelled = true;
    };
  }, [text]);
  if (html === null) return <p className="p-4 text-sm text-muted">Rendering the preview...</p>;
  return (
    <div
      className="prose-content min-h-104 rounded-md border border-border bg-surface p-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Editor(props: EditorProps) {
  const { section, sectionName, track, course, newCourse, path } = props;
  const { client, view, snapshot, repoKey, refresh, handleError, session } = useAdmin();
  const draftKey = path ?? newItemKey(section, track, newCourse ? '+new' : course);
  const ids = { title: useId(), course: useId(), message: useId(), tabs: useId() };

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fields, setFields] = useState<Fields>({ title: '', text: '', courseName: '' });
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const messageEdited = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean; reload: boolean } | null>(
    null,
  );

  // Load the file (or the template) once, then any draft saved in this browser.
  const load = useCallback(
    async (ignoreDraft = false) => {
      try {
        let baseline: Fields;
        let expectSha: string | null = null;
        if (path) {
          const file = snapshot.files.get(path);
          if (!file) {
            setError({
              text: 'This file is no longer on GitHub. Go back to the list.',
              retry: false,
              reload: false,
            });
            return;
          }
          const doc = toEditorDoc(section, await client.readText(file.sha));
          baseline = { title: doc.title, text: doc.text, courseName: '' };
          expectSha = file.sha;
        } else {
          baseline = { title: '', text: templateFor(section, track), courseName: '' };
        }
        const draft = ignoreDraft ? null : loadDraft(repoKey, draftKey);
        const draftFields = draft && {
          title: draft.title,
          text: draft.text,
          courseName: draft.courseName ?? '',
        };
        const useDraft = draftFields && !same(draftFields, baseline) ? draftFields : null;
        // A draft started from an older version must not silently replace newer work.
        if (useDraft && path && draft?.baseSha) expectSha = draft.baseSha;
        setLoaded({ baseline, expectSha });
        setFields(useDraft ?? baseline);
        setRestoredAt(useDraft ? (draft?.savedAt ?? null) : null);
        setDraftSavedAt(useDraft ? (draft?.savedAt ?? null) : null);
        setError(null);
      } catch (e) {
        setError({ text: handleError(e), retry: false, reload: false });
      }
    },
    [path, snapshot.files, section, client, track, repoKey, draftKey, handleError],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const dirty = loaded !== null && !same(fields, loaded.baseline);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props]);

  // Autosave the draft; a clean editor has no draft.
  useEffect(() => {
    if (!loaded) return;
    if (!dirty) {
      removeDraft(repoKey, draftKey);
      return;
    }
    const timer = window.setTimeout(() => {
      const savedAt = Date.now();
      if (saveDraft(repoKey, draftKey, { ...fields, baseSha: loaded.expectSha, savedAt }))
        setDraftSavedAt(savedAt);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fields, dirty, loaded, repoKey, draftKey]);

  // The browser's own prompt when closing or reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Plan the commit as the author types: CHANGES, CHECKS and the default message.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      let fileText: string;
      try {
        fileText = fromEditorDoc(section, { title: fields.title, text: fields.text }, todayIso());
        setYamlError(null);
      } catch (e) {
        setYamlError((e as Error).message.split('\n')[0] ?? 'Invalid YAML');
        setPlan(null);
        return;
      }
      void planSave(view, {
        section,
        sectionName,
        track,
        course,
        newCourseName: newCourse ? fields.courseName : undefined,
        existingPath: path,
        title: fields.title,
        fileText,
      })
        .then((p) => {
          if (cancelled) return;
          if (path && loaded.expectSha) p.expect[path] = loaded.expectSha;
          setPlan(p);
          if (!messageEdited.current) setMessage(p.message);
        })
        .catch(
          (e: unknown) =>
            !cancelled && setError({ text: handleError(e), retry: false, reload: false }),
        );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fields, loaded, view, section, sectionName, track, course, newCourse, path, handleError]);

  const checks: Check[] = useMemo(
    () => [
      ...(yamlError
        ? [{ id: 'yaml', label: 'Front-matter is valid YAML', ok: false, detail: yamlError }]
        : []),
      ...(plan?.checks ?? []),
    ],
    [plan, yamlError],
  );
  const canCommit = Boolean(plan) && !yamlError && allPass(checks) && (dirty || !path) && !busy;

  async function commit() {
    if (!plan || !loaded) return;
    setBusy(true);
    setError(null);
    saveDraft(repoKey, draftKey, { ...fields, baseSha: loaded.expectSha, savedAt: Date.now() });
    try {
      const result = await client.commit({ ...plan, message: message.trim() || plan.message });
      removeDraft(repoKey, draftKey);
      await refresh();
      const courseSlug = newCourse ? plan.path.split('/')[3] : undefined;
      props.onCommitted(
        `Committed ${fileName(plan.path)} (${result.commitSha.slice(0, 7)})`,
        courseSlug,
      );
    } catch (e) {
      const err = toGitHubError(e);
      setError({
        text: handleError(e),
        retry: err.kind === 'conflict' && err.details.reason === 'moved',
        reload: err.kind === 'conflict' && err.details.reason === 'changed',
      });
    } finally {
      setBusy(false);
    }
  }

  // "Load the latest version": refresh, then reload the file once the new snapshot is in.
  const reloadWanted = useRef(false);
  async function loadLatest() {
    removeDraft(repoKey, draftKey);
    reloadWanted.current = true;
    await refresh();
  }
  useEffect(() => {
    if (!reloadWanted.current) return;
    reloadWanted.current = false;
    void load(true);
  }, [load]);

  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  const titleLabel = section === 'interview-questions' ? 'Question' : 'Title';
  const files = plan?.rows.length ?? 0;

  return (
    <div>
      {props.pendingLeave && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-modified bg-surface p-3"
        >
          <p className="font-semibold">You have unsaved changes.</p>
          <button type="button" onClick={props.onKeepEditing} className={buttonClass.secondary}>
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => {
              removeDraft(repoKey, draftKey);
              props.onDiscard();
            }}
            className={buttonClass.ghost}
          >
            Discard
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={props.onBack} className={buttonClass.ghost}>
          <ArrowLeft aria-hidden className="size-4" />
          Back to the list
        </button>
        <h1 className="text-2xl font-bold">
          {path ? `Edit ${fileName(path)}` : `New in ${sectionName}`}
        </h1>
        <span className="ml-auto flex flex-wrap gap-2 text-xs font-semibold" aria-live="polite">
          {dirty && (
            <span className="rounded-full border border-modified px-2.5 py-1 text-modified">
              Unsaved changes
            </span>
          )}
          {dirty && draftSavedAt && (
            <span className="rounded-full border border-border px-2.5 py-1 text-soft">
              Draft saved in this browser {formatClock(draftSavedAt)}
            </span>
          )}
        </span>
      </div>

      {restoredAt && (
        <p className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          Restored your draft from {formatClock(restoredAt)}.
          <button
            type="button"
            onClick={() => {
              removeDraft(repoKey, draftKey);
              if (loaded) setFields(loaded.baseline);
              setRestoredAt(null);
            }}
            className="font-semibold underline"
          >
            Discard the draft
          </button>
        </p>
      )}

      {!loaded ? (
        error ? (
          <p role="alert" className="mt-6 rounded-lg border border-deleted bg-surface p-4">
            {error.text}
          </p>
        ) : (
          <p className="mt-6 text-muted">Loading...</p>
        )
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {newCourse && (
              <div>
                <label htmlFor={ids.course} className="font-semibold">
                  New course name
                </label>
                <input
                  id={ids.course}
                  value={fields.courseName}
                  onChange={(e) => set({ courseName: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text"
                />
              </div>
            )}
            <div>
              <label htmlFor={ids.title} className="font-semibold">
                {titleLabel}
              </label>
              <input
                id={ids.title}
                value={fields.title}
                onChange={(e) => set({ title: e.target.value })}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-lg text-text"
              />
            </div>

            <div>
              <div
                role="tablist"
                aria-label="Editor mode"
                className="mb-2 inline-flex rounded-md border border-border bg-surface p-1"
              >
                {(['write', 'preview'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    id={`${ids.tabs}-${t}`}
                    aria-selected={tab === t}
                    aria-controls={`${ids.tabs}-panel`}
                    onClick={() => setTab(t)}
                    className={`min-h-9 rounded-sm px-3 text-sm font-semibold ${
                      tab === t ? 'bg-nav-active text-text' : 'text-soft hover:text-text'
                    }`}
                  >
                    {t === 'write' ? 'Write' : 'Preview'}
                  </button>
                ))}
              </div>
              <div id={`${ids.tabs}-panel`} role="tabpanel" aria-labelledby={`${ids.tabs}-${tab}`}>
                <div hidden={tab !== 'write'}>
                  <MarkdownEditor
                    value={fields.text}
                    onChange={(text) => set({ text })}
                    label={`${titleLabel === 'Question' ? 'Answer' : 'Content'} (markdown, with front-matter at the top)`}
                  />
                </div>
                {tab === 'preview' && <Preview text={fields.text} />}
              </div>
            </div>
          </div>

          <aside
            aria-label="Commit"
            className="h-fit space-y-5 rounded-lg border border-border bg-surface p-4 xl:sticky xl:top-28"
          >
            <section aria-labelledby={`${ids.message}-changes`}>
              <h2
                id={`${ids.message}-changes`}
                className="text-xs font-semibold tracking-wider text-muted uppercase"
              >
                Changes
              </h2>
              <div className="mt-2">
                {plan ? <ChangeList rows={plan.rows} /> : <p className="text-sm text-muted">...</p>}
              </div>
              <p className="mt-2 text-xs text-muted">
                1 commit, {files} file{files === 1 ? '' : 's'} written together
              </p>
            </section>

            <section aria-labelledby={`${ids.message}-checks`}>
              <h2
                id={`${ids.message}-checks`}
                className="text-xs font-semibold tracking-wider text-muted uppercase"
              >
                Checks
              </h2>
              <div className="mt-2">
                <CheckList checks={checks} />
              </div>
            </section>

            <div>
              <label
                htmlFor={ids.message}
                className="text-xs font-semibold tracking-wider text-muted uppercase"
              >
                Commit message
              </label>
              <input
                id={ids.message}
                value={message}
                onChange={(e) => {
                  messageEdited.current = true;
                  setMessage(e.target.value);
                }}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 font-mono text-xs text-text"
              />
            </div>

            <button
              type="button"
              onClick={() => void commit()}
              disabled={!canCommit}
              className={`${buttonClass.primary} w-full disabled:opacity-50`}
            >
              <UploadCloud aria-hidden className="size-4" />
              {busy ? 'Pushing...' : 'Commit & push'}
            </button>
            {!dirty && path && <p className="text-xs text-muted">No changes to commit yet.</p>}

            {error && (
              <div role="alert" className="space-y-2 rounded-md border border-deleted p-3 text-sm">
                <p>{error.text}</p>
                {error.retry && (
                  <button
                    type="button"
                    onClick={() => void commit()}
                    className={buttonClass.secondary}
                  >
                    <RefreshCw aria-hidden className="size-4" />
                    Try again
                  </button>
                )}
                {error.reload && (
                  <button
                    type="button"
                    onClick={() => void loadLatest()}
                    className={buttonClass.secondary}
                  >
                    Load the latest version (replaces your draft)
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted">
              Pushes to {session.owner}/{session.repo} on {session.branch}.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
