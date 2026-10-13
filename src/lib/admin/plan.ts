/**
 * Turns an admin action (create, edit, rename, delete, undo) into ONE
 * change set: the files to write/copy/delete, the blob each touched path is
 * expected to have on GitHub, rows for the CHANGES panel and the checks.
 * Pure apart from reading files through `RepoView` (browser-safe).
 */
import { checkFileName, baseNameFor, slugify, stem } from '@/lib/content/slug';
import { findLinksTo, rewriteLinks } from '@/lib/content/link-refs';
import type { CommitRequest, CommitResult, FileChange, TreeFile } from '@/lib/github/client';
import { textToBytes } from '@/lib/github/encoding';
import type { SectionSlug } from '@/lib/schema/meta';
import { contentChecks, type Check } from './checks';
import {
  CONTENT,
  courseConfigPath,
  courseFolder,
  fileName,
  folderHasFiles,
  isPerTrackFile,
  itemFolder,
  itemsIn,
  listCourses,
  pageUrl,
  parentFolder,
  perTrackFilePath,
  trackFolder,
} from './paths';

/** The repository as the planners see it. */
export interface RepoView {
  files: Map<string, TreeFile>;
  /** Text of a file at this snapshot. */
  read(path: string): Promise<string>;
}

export type ChangeStatus = 'A' | 'M' | 'R' | 'D';

export interface ChangeRow {
  status: ChangeStatus;
  path: string;
  /** Previous path of a rename. */
  from?: string;
  /** Bytes, for information only. */
  size?: number;
}

export interface Plan extends CommitRequest {
  rows: ChangeRow[];
  checks: Check[];
  /** The item's path after the commit. */
  path: string;
}

/** Collects the changes of one commit together with what each path should look like now. */
class ChangeSetBuilder {
  readonly changes: FileChange[] = [];
  readonly expect: Record<string, string | null> = {};
  readonly rows: ChangeRow[] = [];

  constructor(private readonly files: Map<string, TreeFile>) {}

  private expectCurrent(path: string) {
    if (!(path in this.expect)) this.expect[path] = this.files.get(path)?.sha ?? null;
  }

  write(path: string, content: string) {
    this.expectCurrent(path);
    this.changes.push({ path, action: 'write', content });
    this.rows.push({
      status: this.files.has(path) ? 'M' : 'A',
      path,
      size: textToBytes(content).length,
    });
  }

  delete(path: string) {
    this.expectCurrent(path);
    this.changes.push({ path, action: 'delete' });
    this.rows.push({ status: 'D', path });
  }

  move(from: string, to: string) {
    const file = this.files.get(from);
    if (!file) throw new Error(`${from} does not exist`);
    this.expectCurrent(from);
    this.expectCurrent(to);
    this.changes.push(
      { path: from, action: 'delete' },
      { path: to, action: 'copy', sha: file.sha },
    );
    this.rows.push({ status: 'R', path: to, from, size: file.size });
  }
}

// ---------------------------------------------------------------- course config

interface CourseConfigJson {
  title: string;
  description?: string;
  order?: string[];
  html?: Record<string, unknown>;
  [key: string]: unknown;
}

async function readCourse(
  view: RepoView,
  track: string,
  course: string,
): Promise<CourseConfigJson> {
  return JSON.parse(await view.read(courseConfigPath(track, course))) as CourseConfigJson;
}

function courseJson(config: CourseConfigJson): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

// ---------------------------------------------------------------- messages

export function defaultMessage(
  section: SectionSlug,
  verb: 'add' | 'update' | 'rename' | 'delete' | 'restore',
  file: string,
  to?: string,
): string {
  return `docs(${section}): ${verb} ${file}${to ? ` to ${to}` : ''}`;
}

// ---------------------------------------------------------------- save (create or edit)

export interface SaveInput {
  section: SectionSlug;
  sectionName: string;
  track: string;
  /** Existing course (Learning Notes). */
  course?: string;
  /** Name of a course created together with its first chapter. */
  newCourseName?: string;
  /** Path of the file being edited; absent when creating. */
  existingPath?: string;
  title: string;
  /** The complete file to write (front-matter with title and updated, then body). */
  fileText: string;
}

/** Creates or updates a markdown item, with every side effect in the same commit. */
export async function planSave(view: RepoView, input: SaveInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const checks: Check[] = [];
  const title = input.title.trim();
  checks.push({ id: 'title', label: 'Title is filled in', ok: title.length > 0 });

  let path: string;
  if (input.existingPath) {
    path = input.existingPath;
  } else if (isPerTrackFile(input.section)) {
    path = perTrackFilePath(input.section, input.track);
    checks.push({
      id: 'unique',
      label: 'File name is free',
      ok: !view.files.has(path),
      detail: view.files.has(path) ? 'A file with this name already exists' : undefined,
    });
    const placeholder = `${trackFolder(input.section, input.track)}/.gitkeep`;
    if (view.files.has(placeholder)) b.delete(placeholder);
  } else {
    let course = input.course;
    if (input.section === 'learning-notes' && input.newCourseName !== undefined) {
      const name = input.newCourseName.trim();
      checks.push({ id: 'course-name', label: 'Course name is filled in', ok: name.length > 0 });
      course = baseNameFor(name, 'course');
      const taken = new Set(listCourses(view.files, input.track));
      const free = checkFileName(course, taken);
      checks.push({
        id: 'course-unique',
        label: 'Course name is free',
        ok: free.ok,
        detail: free.ok
          ? undefined
          : `A course named "${course}" already exists. Try "${free.alternative}".`,
      });
    }
    const folder = itemFolder(input.section, input.track, course);
    const base = baseNameFor(title, input.sectionName);
    const taken = new Set(itemsIn(view.files, folder).map((i) => i.slug));
    const free = checkFileName(base, taken);
    checks.push({
      id: 'unique',
      label: 'File name is free',
      ok: free.ok,
      detail: free.ok ? undefined : `${free.message}. Use "${free.alternative}.md" instead.`,
    });
    path = `${folder}/${base}.md`;

    // The folder's first real file replaces its placeholder in the same commit.
    const placeholder = `${folder}/.gitkeep`;
    if (view.files.has(placeholder)) b.delete(placeholder);

    if (input.section === 'learning-notes' && course) {
      if (input.newCourseName !== undefined) {
        const trackKeep = `${trackFolder('learning-notes', input.track)}/.gitkeep`;
        if (view.files.has(trackKeep)) b.delete(trackKeep);
        b.write(
          courseConfigPath(input.track, course),
          courseJson({
            title: input.newCourseName.trim(),
            description: '',
            order: [`${base}.md`],
            html: {},
          }),
        );
      } else {
        const config = await readCourse(view, input.track, course);
        config.order = [...(config.order ?? []).filter((f) => f !== `${base}.md`), `${base}.md`];
        b.write(courseConfigPath(input.track, course), courseJson(config));
      }
    }
  }

  b.write(path, input.fileText);
  // Keep the item's own row first in the CHANGES list.
  b.rows.unshift(
    ...b.rows.splice(
      b.rows.findIndex((r) => r.path === path),
      1,
    ),
  );
  checks.push(...contentChecks(input.section, input.fileText));

  const isNew = !input.existingPath;
  return {
    message: defaultMessage(input.section, isNew ? 'add' : 'update', fileName(path)),
    changes: b.changes,
    expect: b.expect,
    rows: b.rows,
    checks,
    path,
  };
}

// ---------------------------------------------------------------- link fixes

export interface LinkRef {
  file: string;
  line: number;
  url: string;
}

/** Markdown files under content/, except `exclude`. */
function markdownPaths(view: RepoView, exclude: string): string[] {
  return [...view.files.keys()].filter(
    (p) => p.startsWith(`${CONTENT}/`) && p.endsWith('.md') && p !== exclude,
  );
}

/**
 * Links that would break when `path` is renamed or deleted, and the fixed
 * text of every file containing them (relinked to `newPath`, or unlinked when
 * `newPath` is null).
 */
export async function findBrokenLinkFixes(
  view: RepoView,
  path: string,
  newPath: string | null,
): Promise<{ refs: LinkRef[]; fixes: Map<string, string> }> {
  const target = pageUrl(path);
  const refs: LinkRef[] = [];
  const fixes = new Map<string, string>();
  if (!target) return { refs, fixes };
  const replacement = newPath ? pageUrl(newPath) : null;
  for (const file of markdownPaths(view, path)) {
    const markdown = await view.read(file);
    const found = findLinksTo([{ file, markdown }], target);
    if (found.length === 0) continue;
    refs.push(...found);
    fixes.set(file, rewriteLinks(markdown, target, replacement).markdown);
  }
  return { refs, fixes };
}

// ---------------------------------------------------------------- rename

export interface RenameInput {
  section: SectionSlug;
  track: string;
  course?: string;
  path: string;
  /** What the author typed; slugified into the new file name. */
  newName: string;
  /** Fixed text of files linking to the old address (from findBrokenLinkFixes). */
  linkFixes?: Map<string, string>;
}

export function renameTarget(path: string, newName: string): string {
  const name = fileName(path);
  const ext = name.slice(name.lastIndexOf('.'));
  return `${parentFolder(path)}/${slugify(newName)}${ext}`;
}

export async function planRename(view: RepoView, input: RenameInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const checks: Check[] = [];
  const slug = slugify(input.newName);
  const to = renameTarget(input.path, input.newName);
  const from = input.path;
  checks.push({
    id: 'name',
    label: 'New name has letters or digits',
    ok: slug.length > 0,
  });
  checks.push({ id: 'changed', label: 'New name differs from the current one', ok: to !== from });
  const taken = new Set(
    itemsIn(view.files, parentFolder(from))
      .map((i) => i.slug)
      .filter((s) => s !== stem(fileName(from))),
  );
  const free = checkFileName(slug, taken);
  checks.push({
    id: 'unique',
    label: 'File name is free',
    ok: free.ok,
    detail: free.ok ? undefined : `${free.message}. Try "${free.alternative}".`,
  });

  if (checks.every((c) => c.ok)) {
    b.move(from, to);
    if (input.section === 'learning-notes' && input.course) {
      const config = await readCourse(view, input.track, input.course);
      const oldName = fileName(from);
      const newName = fileName(to);
      config.order = (config.order ?? []).map((f) => (f === oldName ? newName : f));
      if (config.html && oldName in config.html) {
        config.html = Object.fromEntries(
          Object.entries(config.html).map(([k, v]) => [k === oldName ? newName : k, v]),
        );
      }
      b.write(courseConfigPath(input.track, input.course), courseJson(config));
    }
    for (const [file, text] of input.linkFixes ?? []) b.write(file, text);
  }

  return {
    message: defaultMessage(input.section, 'rename', fileName(from), fileName(to)),
    changes: b.changes,
    expect: b.expect,
    rows: b.rows,
    checks,
    path: to,
  };
}

// ---------------------------------------------------------------- delete

export interface DeleteInput {
  section: SectionSlug;
  track: string;
  course?: string;
  path: string;
  /** Unlinked text of files linking to the deleted page (from findBrokenLinkFixes). */
  linkFixes?: Map<string, string>;
}

export async function planDelete(view: RepoView, input: DeleteInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  b.delete(input.path);

  if (input.section === 'learning-notes' && input.course) {
    const config = await readCourse(view, input.track, input.course);
    const name = fileName(input.path);
    config.order = (config.order ?? []).filter((f) => f !== name);
    if (config.html && name in config.html) {
      config.html = Object.fromEntries(Object.entries(config.html).filter(([k]) => k !== name));
    }
    b.write(courseConfigPath(input.track, input.course), courseJson(config));
  }
  for (const [file, text] of input.linkFixes ?? []) b.write(file, text);

  // Git drops empty folders, so the skeleton's placeholder comes back with the last file.
  const folder =
    input.section === 'learning-notes' && input.course
      ? courseFolder(input.track, input.course)
      : trackFolder(input.section, input.track);
  if (!folderHasFiles(view.files.keys(), folder, new Set([input.path]))) {
    b.write(`${folder}/.gitkeep`, '');
  }

  return {
    message: defaultMessage(input.section, 'delete', fileName(input.path)),
    changes: b.changes,
    expect: b.expect,
    rows: b.rows,
    checks: [],
    path: input.path,
  };
}

// ---------------------------------------------------------------- undo

/**
 * The commit that puts every path of `done` back as it was before, reusing
 * the old blobs. It expects the paths as `done` left them, so it never
 * overwrites work pushed after it.
 */
export function planUndo(done: CommitResult, message: string): CommitRequest {
  const changes: FileChange[] = [];
  const expect: Record<string, string | null> = {};
  for (const [path, before] of Object.entries(done.before)) {
    const after = done.after[path] ?? null;
    if (before === after) continue;
    expect[path] = after;
    changes.push(
      before === null ? { path, action: 'delete' } : { path, action: 'copy', sha: before },
    );
  }
  return { message, changes, expect };
}
