'use client';

import matter from 'gray-matter';
import { ArrowLeft, FileUp, ImagePlus, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { allPass, type Check } from '@/lib/admin/checks';
import { fromEditorDoc, todayIso, toEditorDoc } from '@/lib/admin/document';
import { loadDraft, newItemKey, removeDraft, saveDraft, type Draft } from '@/lib/admin/drafts';
import { imageMarkdown, isImageFile, prepareImage } from '@/lib/admin/images';
import { courseFolder, fileName, HTML_SECTIONS, itemFolder, parentFolder } from '@/lib/admin/paths';
import { htmlChapterMeta, planSave, planSaveHtml, type Plan } from '@/lib/admin/plan';
import { templateFor } from '@/lib/admin/templates';
import { humanize, stem } from '@/lib/content/slug';
import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from '@/lib/github/encoding';
import { toGitHubError } from '@/lib/github/errors';
import type { SectionSlug } from '@/lib/schema/meta';
import { useAdmin } from './admin-context';
import { ChangeList, CheckList } from './change-panels';
import { formatBytes, formatClock } from './format';
import { MarkdownEditor, type MarkdownEditorApi } from './markdown-editor';

type Format = 'md' | 'html';

interface Fields {
  title: string;
  text: string;
  courseName: string;
  format: Format;
  /** HTML chapters keep description and tags in _course.json. */
  description: string;
  tags: string;
}

interface PendingFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

interface PendingImage extends PendingFile {
  width: number;
  height: number;
}

interface Loaded {
  baseline: Fields;
  /** Blob sha the commit must find on GitHub (null for a new item). */
  expectSha: string | null;
}

interface EditorError {
  text: string;
  retry?: boolean;
  reload?: boolean;
  /** Retries by itself once the browser is back online. */
  offline?: boolean;
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

const IMAGE_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Sections whose pages render markdown images (the others parse lists and tables). */
const IMAGE_SECTIONS: readonly SectionSlug[] = ['learning-notes', 'interview-questions'];

const same = (a: Fields, b: Fields) =>
  a.title === b.title &&
  a.text === b.text &&
  a.courseName === b.courseName &&
  a.format === b.format &&
  a.description === b.description &&
  a.tags === b.tags;

const splitTags = (tags: string) =>
  tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

function Preview({
  text,
  images,
  folder,
}: {
  text: string;
  images: PendingImage[];
  /** The item's folder, for images already in the repository. */
  folder: string | null;
}) {
  const { snapshot, client } = useAdmin();
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
      // Images: uploads waiting in this commit, or files already in the item's assets/.
      const sources = new Map<string, string>();
      for (const match of body.matchAll(/!\[[^\]]*\]\((assets\/[^)\s]+)/g)) {
        const src = match[1] as string;
        const name = src.slice('assets/'.length);
        const pending = images.find((i) => i.name === name);
        let bytes: Uint8Array | undefined = pending?.bytes;
        const existing = folder ? snapshot.files.get(`${folder}/${src}`) : undefined;
        if (!bytes && existing) bytes = await client.readBlob(existing.sha).catch(() => undefined);
        if (!bytes) continue;
        // A data: URL, as the site's CSP allows images from 'self', data: and https: only.
        const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        sources.set(src, `data:${IMAGE_TYPES[ext] ?? 'image/webp'};base64,${bytesToBase64(bytes)}`);
      }
      // The same pipeline as the site; raw HTML in markdown is dropped by it.
      const { renderMarkdown } = await import('@/lib/content/markdown/render');
      const rendered = await renderMarkdown(body, {
        resolveAsset: (src) => sources.get(src) ?? src,
      });
      if (!cancelled) setHtml(rendered.html);
    })();
    return () => {
      cancelled = true;
    };
  }, [text, images, folder, snapshot.files, client]);
  if (html === null) return <p className="p-4 text-sm text-muted">Rendering the preview...</p>;
  return (
    <div
      className="prose-content min-h-104 rounded-md border border-border bg-surface p-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Drop zone and file picker for an HTML artifact (any size). */
function HtmlUpload({
  file,
  current,
  onFile,
}: {
  file: { name: string; size: number } | null;
  current: { name: string; size: number } | null;
  onFile(file: File): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const shown = file ?? current;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) onFile(dropped);
      }}
      className={`rounded-lg border-2 border-dashed p-6 text-center ${over ? 'border-text bg-nav-active' : 'border-dash bg-surface'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="sr-only"
        aria-label="HTML file"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) onFile(chosen);
          e.target.value = '';
        }}
      />
      {shown ? (
        <p className="flex flex-wrap items-center justify-center gap-3">
          <span className="font-mono text-sm">{shown.name}</span>
          <span className="text-sm text-muted">{formatBytes(shown.size)}</span>
          {!file && <span className="text-sm text-muted">(current file)</span>}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={buttonClass.secondary}
          >
            <FileUp aria-hidden className="size-4" />
            Replace
          </button>
        </p>
      ) : (
        <>
          <p className="text-soft">Drop an .html or .htm file here, any size.</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`${buttonClass.secondary} mt-3`}
          >
            <FileUp aria-hidden className="size-4" />
            Choose a file
          </button>
        </>
      )}
      <p className="mt-3 text-xs text-muted">
        Uploaded HTML is never shown in the admin. The site shows it in a sandboxed frame.
      </p>
    </div>
  );
}

export function Editor(props: EditorProps) {
  const { section, sectionName, track, course, newCourse, path } = props;
  const { client, view, snapshot, repoKey, refresh, applyCommit, handleError, session } =
    useAdmin();
  const draftKey = path ?? newItemKey(section, track, newCourse ? '+new' : course);
  const ids = {
    title: useId(),
    course: useId(),
    message: useId(),
    tabs: useId(),
    description: useId(),
    tags: useId(),
  };
  const editorApi = useRef<MarkdownEditorApi | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fields, setFields] = useState<Fields>({
    title: '',
    text: '',
    courseName: '',
    format: 'md',
    description: '',
    tags: '',
  });
  const [htmlFile, setHtmlFile] = useState<PendingFile | null>(null);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lostUploads, setLostUploads] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftTooBig, setDraftTooBig] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const messageEdited = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EditorError | null>(null);

  const isChapter = section === 'learning-notes';
  const existingFormat: Format | null = path ? (path.endsWith('.html') ? 'html' : 'md') : null;
  const canSwitchFormat = !path && HTML_SECTIONS.includes(section);
  /** The item's folder when it is already known (images there can be previewed and named). */
  const folder = path
    ? parentFolder(path)
    : newCourse
      ? null
      : section === 'learning-notes'
        ? course
          ? courseFolder(track, course)
          : null
        : itemFolder(section, track, course);

  // Load the file (or the template) once, then any draft saved in this browser.
  const load = useCallback(
    async (ignoreDraft = false) => {
      try {
        let baseline: Fields = {
          title: '',
          text: templateFor(section, track),
          courseName: '',
          format: 'md',
          description: '',
          tags: '',
        };
        let expectSha: string | null = null;
        if (path) {
          const file = snapshot.files.get(path);
          if (!file) {
            setError({ text: 'This file is no longer on GitHub. Go back to the list.' });
            return;
          }
          expectSha = file.sha;
          if (path.endsWith('.html')) {
            const meta = isChapter ? await htmlChapterMeta(view, path) : null;
            baseline = {
              ...baseline,
              text: '',
              format: 'html',
              title: meta?.title || humanize(stem(fileName(path))),
              description: meta?.description ?? '',
              tags: (meta?.tags ?? []).join(', '),
            };
          } else {
            const doc = toEditorDoc(section, await client.readText(file.sha));
            baseline = { ...baseline, title: doc.title, text: doc.text };
          }
        }
        const draft = ignoreDraft ? null : loadDraft(repoKey, draftKey);
        let restored: Fields | null = null;
        if (draft) {
          const fromDraft: Fields = {
            title: draft.title,
            text: draft.text,
            courseName: draft.courseName ?? '',
            format: draft.format ?? baseline.format,
            description: draft.description ?? baseline.description,
            tags: draft.tags ?? baseline.tags,
          };
          const hasUploads = Boolean(draft.html) || Boolean(draft.images?.length);
          if (!same(fromDraft, baseline) || hasUploads) restored = fromDraft;
          if (restored) {
            setHtmlFile(
              draft.html?.text !== undefined
                ? {
                    name: draft.html.name,
                    size: draft.html.size,
                    bytes: textToBytes(draft.html.text),
                  }
                : null,
            );
            setImages(
              (draft.images ?? []).map((i) => {
                const bytes = base64ToBytes(i.base64);
                return {
                  name: i.name,
                  width: i.width,
                  height: i.height,
                  size: bytes.length,
                  bytes,
                };
              }),
            );
            setLostUploads(Boolean(draft.html && draft.html.text === undefined));
          }
        }
        // A draft started from an older version must not silently replace newer work.
        if (restored && path && draft?.baseSha) expectSha = draft.baseSha;
        setLoaded({ baseline, expectSha });
        setFields(restored ?? baseline);
        setRestoredAt(restored ? (draft?.savedAt ?? null) : null);
        setDraftSavedAt(restored ? (draft?.savedAt ?? null) : null);
        setError(null);
      } catch (e) {
        setError({ text: handleError(e) });
      }
    },
    [path, snapshot.files, section, client, track, repoKey, draftKey, handleError, isChapter, view],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const dirty =
    loaded !== null && (!same(fields, loaded.baseline) || htmlFile !== null || images.length > 0);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props]);

  // Autosave the draft; a clean editor has no draft. Uploads are kept when they fit.
  useEffect(() => {
    if (!loaded) return;
    if (!dirty) {
      removeDraft(repoKey, draftKey);
      return;
    }
    const timer = window.setTimeout(() => {
      const savedAt = Date.now();
      const base: Draft = { ...fields, baseSha: loaded.expectSha, savedAt };
      const full: Draft = {
        ...base,
        html: htmlFile
          ? { name: htmlFile.name, size: htmlFile.size, text: bytesToText(htmlFile.bytes) }
          : undefined,
        images: images.map((i) => ({
          name: i.name,
          width: i.width,
          height: i.height,
          base64: bytesToBase64(i.bytes),
        })),
      };
      if (saveDraft(repoKey, draftKey, full)) {
        setDraftTooBig(false);
        setDraftSavedAt(savedAt);
      } else if (
        saveDraft(repoKey, draftKey, {
          ...base,
          html: htmlFile ? { name: htmlFile.name, size: htmlFile.size } : undefined,
        })
      ) {
        setDraftTooBig(true);
        setDraftSavedAt(savedAt);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fields, htmlFile, images, dirty, loaded, repoKey, draftKey]);

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

  /** The commit for what is on screen now: CHANGES, CHECKS and the default message. */
  const buildPlan = useCallback(async (): Promise<{
    plan: Plan | null;
    yamlError: string | null;
  }> => {
    if (!loaded) return { plan: null, yamlError: null };
    const common = {
      section,
      sectionName,
      track,
      course,
      newCourseName: newCourse ? fields.courseName : undefined,
      existingPath: path,
      title: fields.title,
    };
    let planned: Plan;
    if (fields.format === 'html') {
      planned = await planSaveHtml(view, {
        ...common,
        file: htmlFile ? { name: htmlFile.name, bytes: htmlFile.bytes } : undefined,
        description: fields.description,
        tags: splitTags(fields.tags),
        today: todayIso(),
      });
    } else {
      let fileText: string;
      try {
        fileText = fromEditorDoc(section, { title: fields.title, text: fields.text }, todayIso());
      } catch (e) {
        return { plan: null, yamlError: (e as Error).message.split('\n')[0] ?? 'Invalid YAML' };
      }
      planned = await planSave(view, {
        ...common,
        fileText,
        assets: images.map((i) => ({ name: i.name, bytes: i.bytes })),
      });
    }
    if (path && loaded.expectSha) planned.expect[path] = loaded.expectSha;
    return { plan: planned, yamlError: null };
  }, [
    fields,
    htmlFile,
    images,
    loaded,
    view,
    section,
    sectionName,
    track,
    course,
    newCourse,
    path,
  ]);

  // Plan the commit as the author types, to show CHANGES, CHECKS and the default message.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      buildPlan()
        .then((next) => {
          if (cancelled) return;
          setYamlError(next.yamlError);
          setPlan(next.plan);
          if (next.plan && !messageEdited.current) setMessage(next.plan.message);
        })
        .catch((e: unknown) => !cancelled && setError({ text: handleError(e) }));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buildPlan, loaded, handleError]);

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

  const commit = useCallback(async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      // Plan again from what is on screen: the panel can be a keystroke (or a file) behind.
      const next = await buildPlan();
      setPlan(next.plan);
      setYamlError(next.yamlError);
      const fresh = next.plan;
      if (!fresh || next.yamlError || !allPass(fresh.checks)) return;
      const result = await client.commit({
        ...fresh,
        message: (messageEdited.current && message.trim()) || fresh.message,
      });
      removeDraft(repoKey, draftKey);
      applyCommit(result);
      const courseSlug = newCourse ? fresh.path.split('/')[3] : undefined;
      props.onCommitted(
        `Committed ${fileName(fresh.path)} (${result.commitSha.slice(0, 7)})`,
        courseSlug,
      );
    } catch (e) {
      const err = toGitHubError(e);
      setError({
        text: handleError(e),
        retry: err.kind === 'conflict' && err.details.reason === 'moved',
        reload: err.kind === 'conflict' && err.details.reason === 'changed',
        offline: err.kind === 'offline',
      });
    } finally {
      setBusy(false);
    }
  }, [
    buildPlan,
    loaded,
    client,
    message,
    repoKey,
    draftKey,
    applyCommit,
    newCourse,
    props,
    handleError,
  ]);

  // Offline: try again by itself as soon as the browser is back online.
  useEffect(() => {
    if (!error?.offline) return;
    const retry = () => void commit();
    window.addEventListener('online', retry, { once: true });
    return () => window.removeEventListener('online', retry);
  }, [error, commit]);

  // "Load the latest version": refresh, then reload the file once the new snapshot is in.
  const reloadWanted = useRef(false);
  async function loadLatest() {
    removeDraft(repoKey, draftKey);
    setHtmlFile(null);
    setImages([]);
    reloadWanted.current = true;
    await refresh();
  }
  useEffect(() => {
    if (!reloadWanted.current) return;
    reloadWanted.current = false;
    void load(true);
  }, [load]);

  async function chooseHtml(file: File) {
    if (!/\.html?$/i.test(file.name)) {
      setError({ text: `"${file.name}" is not an HTML file. Choose a .html or .htm file.` });
      return;
    }
    setError(null);
    setLostUploads(false);
    setHtmlFile({
      name: file.name,
      size: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  /** Converts and inserts images: at the drop point when dropped, else at the cursor. */
  async function addImages(files: File[], at?: { x: number; y: number }) {
    setImageError(null);
    const assetsDir = folder ? `${folder}/assets/` : null;
    const taken = new Set<string>([
      ...(assetsDir
        ? [...snapshot.files.keys()]
            .filter((p) => p.startsWith(assetsDir))
            .map((p) => stem(fileName(p)))
        : []),
      ...images.map((i) => stem(i.name)),
    ]);
    const added: PendingImage[] = [];
    for (const file of files) {
      try {
        const image = await prepareImage(file, taken);
        taken.add(stem(image.name));
        added.push({ ...image, size: image.bytes.length });
        const alt = humanize(stem(file.name).replace(/[-_]+/g, ' '));
        // Later images follow the first one, wherever the cursor is then.
        editorApi.current?.insert(
          `${imageMarkdown(alt, `assets/${image.name}`, image.width, image.height)}\n`,
          added.length === 1 ? at : undefined,
        );
      } catch (e) {
        setImageError((e as Error).message);
      }
    }
    if (added.length) setImages((list) => [...list, ...added]);
  }

  function dropImages(e: DragEvent) {
    const files = [...e.dataTransfer.files].filter((f) => isImageFile(f.name));
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    void addImages(files, { x: e.clientX, y: e.clientY });
  }

  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  const titleLabel = section === 'interview-questions' ? 'Question' : 'Title';
  const files = plan?.rows.length ?? 0;
  const currentHtml =
    path && existingFormat === 'html'
      ? { name: fileName(path), size: snapshot.files.get(path)?.size ?? 0 }
      : null;

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
          {lostUploads &&
            ' The uploaded file was too large to keep in this browser; upload it again.'}
          <button
            type="button"
            onClick={() => {
              removeDraft(repoKey, draftKey);
              if (loaded) setFields(loaded.baseline);
              setHtmlFile(null);
              setImages([]);
              setRestoredAt(null);
              setLostUploads(false);
            }}
            className="font-semibold underline"
          >
            Discard the draft
          </button>
        </p>
      )}
      {draftTooBig && (
        <p className="mt-3 rounded-lg border border-modified bg-surface p-3 text-sm">
          The uploaded files are too large to keep in this browser&apos;s storage. Your text is
          saved; the files stay in this tab until you commit.
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
            {canSwitchFormat && (
              <div
                role="group"
                aria-label="Format"
                className="inline-flex rounded-md border border-border bg-surface p-1"
              >
                {(['md', 'html'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={fields.format === f}
                    onClick={() => set({ format: f })}
                    className={`min-h-9 rounded-sm px-3 text-sm font-semibold ${
                      fields.format === f ? 'bg-nav-active text-text' : 'text-soft hover:text-text'
                    }`}
                  >
                    {f === 'md' ? 'Markdown' : 'HTML'}
                  </button>
                ))}
              </div>
            )}

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

            {(fields.format === 'md' || isChapter || !path) && (
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
                {fields.format === 'html' && !isChapter && (
                  <p className="mt-1 text-xs text-muted">
                    Used for the file name. The site shows the title from the file&apos;s own
                    &lt;title&gt;.
                  </p>
                )}
              </div>
            )}

            {fields.format === 'html' ? (
              <>
                {isChapter && (
                  <>
                    <div>
                      <label htmlFor={ids.description} className="font-semibold">
                        Description
                      </label>
                      <textarea
                        id={ids.description}
                        value={fields.description}
                        onChange={(e) => set({ description: e.target.value })}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-text"
                      />
                    </div>
                    <div>
                      <label htmlFor={ids.tags} className="font-semibold">
                        Tags (comma-separated)
                      </label>
                      <input
                        id={ids.tags}
                        value={fields.tags}
                        onChange={(e) => set({ tags: e.target.value })}
                        className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text"
                      />
                    </div>
                  </>
                )}
                <HtmlUpload
                  file={htmlFile}
                  current={currentHtml}
                  onFile={(f) => void chooseHtml(f)}
                />
              </>
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div
                    role="tablist"
                    aria-label="Editor mode"
                    className="inline-flex rounded-md border border-border bg-surface p-1"
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
                  {IMAGE_SECTIONS.includes(section) && tab === 'write' && (
                    <>
                      <input
                        ref={imageInput}
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        className="sr-only"
                        aria-label="Images to insert"
                        onChange={(e) => {
                          void addImages([...(e.target.files ?? [])]);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => imageInput.current?.click()}
                        className={buttonClass.ghost}
                      >
                        <ImagePlus aria-hidden className="size-4" />
                        Insert image
                      </button>
                    </>
                  )}
                </div>
                <div
                  id={`${ids.tabs}-panel`}
                  role="tabpanel"
                  aria-labelledby={`${ids.tabs}-${tab}`}
                >
                  <div
                    hidden={tab !== 'write'}
                    onDropCapture={dropImages}
                    onDragOverCapture={(e) => e.preventDefault()}
                  >
                    <MarkdownEditor
                      value={fields.text}
                      onChange={(text) => set({ text })}
                      label={`${titleLabel === 'Question' ? 'Answer' : 'Content'} (markdown, with front-matter at the top)`}
                      apiRef={editorApi}
                    />
                  </div>
                  {tab === 'preview' && (
                    <Preview text={fields.text} images={images} folder={folder} />
                  )}
                </div>
                {imageError && (
                  <p role="alert" className="mt-2 text-sm text-deleted">
                    {imageError}
                  </p>
                )}
                {images.length > 0 && (
                  <ul aria-label="Images in this commit" className="mt-3 space-y-1 text-sm">
                    {images.map((image) => (
                      <li key={image.name} className="flex items-center gap-3">
                        <span className="font-mono text-xs">assets/{image.name}</span>
                        <span className="text-xs text-muted">
                          {image.width}×{image.height}, {formatBytes(image.size)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${image.name}`}
                          onClick={() =>
                            setImages((list) => list.filter((i) => i.name !== image.name))
                          }
                          className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-nav-active hover:text-text"
                        >
                          <X aria-hidden className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
                {error.offline && (
                  <p className="text-muted">It will try again when you are back online.</p>
                )}
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
