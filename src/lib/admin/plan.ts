/**
 * Turns an admin action (create, edit, upload, rename, delete, restore,
 * revert, reorder, undo) into ONE change set: the files to write/copy/delete,
 * the blob each touched path is expected to have on GitHub, rows for the
 * CHANGES panel and the checks. Pure apart from reading files through
 * `RepoView` (browser-safe).
 */
import { findLinksTo, rewriteLinks } from '@/lib/content/link-refs';
import { baseNameFor, checkFileName, slugify, stem } from '@/lib/content/slug';
import type {
  CommitDetail,
  CommitRequest,
  CommitResult,
  FileChange,
  TreeFile,
} from '@/lib/github/client';
import { textToBytes } from '@/lib/github/encoding';
import { courseSchema } from '@/lib/schema/learning-notes';
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

const byteLength = (content: string | Uint8Array) =>
  typeof content === 'string' ? textToBytes(content).length : content.length;

/** Collects the changes of one commit together with what each path should look like now. */
class ChangeSetBuilder {
  readonly changes: FileChange[] = [];
  readonly expect: Record<string, string | null> = {};
  readonly rows: ChangeRow[] = [];

  constructor(private readonly files: Map<string, TreeFile>) {}

  /** Expect `path` as it is in the snapshot, unless an expectation was set already. */
  private expectCurrent(path: string) {
    if (!(path in this.expect)) this.expect[path] = this.files.get(path)?.sha ?? null;
  }

  write(path: string, content: string | Uint8Array) {
    this.expectCurrent(path);
    this.changes.push({ path, action: 'write', content });
    this.rows.push({ status: this.files.has(path) ? 'M' : 'A', path, size: byteLength(content) });
  }

  delete(path: string) {
    this.expectCurrent(path);
    this.changes.push({ path, action: 'delete' });
    this.rows.push({ status: 'D', path });
  }

  /** Renames a file; with `content` the moved file is rewritten too. */
  move(from: string, to: string, content?: string) {
    const file = this.files.get(from);
    if (!file) throw new Error(`${from} does not exist`);
    this.expectCurrent(from);
    this.expectCurrent(to);
    this.changes.push(
      { path: from, action: 'delete' },
      content === undefined
        ? { path: to, action: 'copy', sha: file.sha }
        : { path: to, action: 'write', content },
    );
    this.rows.push({
      status: 'R',
      path: to,
      from,
      size: content === undefined ? file.size : byteLength(content),
    });
  }

  /** Puts an existing blob at `path`, expecting `expected` there (null: absent). */
  restore(path: string, sha: string, expected: string | null, size?: number) {
    this.expect[path] = expected;
    this.changes.push({ path, action: 'copy', sha });
    this.rows.push({ status: expected === null ? 'A' : 'M', path, size });
  }

  /** Deletes `path`, expecting `expected` there. */
  remove(path: string, expected: string) {
    this.expect[path] = expected;
    this.changes.push({ path, action: 'delete' });
    this.rows.push({ status: 'D', path });
  }

  plan(message: string, checks: Check[], path: string): Plan {
    return { message, changes: this.changes, expect: this.expect, rows: this.rows, checks, path };
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

export interface HtmlMeta {
  title: string;
  description: string;
  tags: string[];
  updated?: string;
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

/** The chapter files of a course in reading order (listed first, then any others). */
export async function chapterOrder(
  view: RepoView,
  track: string,
  course: string,
): Promise<string[]> {
  const present = itemsIn(view.files, courseFolder(track, course)).map((i) => i.fileName);
  let order: string[] = [];
  try {
    order = (await readCourse(view, track, course)).order ?? [];
  } catch {
    order = [];
  }
  const listed = order.filter((f) => present.includes(f));
  return [...listed, ...present.filter((f) => !listed.includes(f))];
}

/** Metadata of an HTML chapter, from its course's _course.json. */
export async function htmlChapterMeta(view: RepoView, path: string): Promise<HtmlMeta> {
  const [, , track = '', course = ''] = path.split('/');
  const config = await readCourse(view, track, course);
  const meta = (config.html?.[fileName(path)] ?? {}) as Partial<HtmlMeta>;
  return {
    title: meta.title ?? '',
    description: meta.description ?? '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    updated: meta.updated,
  };
}

// ---------------------------------------------------------------- messages

export function defaultMessage(
  section: SectionSlug,
  verb: 'add' | 'update' | 'rename' | 'delete' | 'restore' | 'reorder',
  file: string,
  to?: string,
): string {
  return `docs(${section}): ${verb} ${file}${to ? ` to ${to}` : ''}`;
}

// ---------------------------------------------------------------- new items

interface NewItemInput {
  section: SectionSlug;
  sectionName: string;
  track: string;
  /** Existing course (Learning Notes). */
  course?: string;
  /** Name of a course created together with its first chapter. */
  newCourseName?: string;
  title: string;
}

interface Placement {
  path: string;
  /** Course slug for Learning Notes (new or existing). */
  course?: string;
  newCourse: boolean;
}

/**
 * Where a new item goes: its path from the title, name checks, the new
 * course's slug, and removal of the placeholders its first file replaces.
 */
function placeNewItem(
  view: RepoView,
  b: ChangeSetBuilder,
  checks: Check[],
  input: NewItemInput,
  ext: '.md' | '.html',
): Placement {
  if (isPerTrackFile(input.section)) {
    const path = perTrackFilePath(input.section, input.track);
    checks.push({
      id: 'unique',
      label: 'File name is free',
      ok: !view.files.has(path),
      detail: view.files.has(path) ? 'A file with this name already exists' : undefined,
    });
    const placeholder = `${trackFolder(input.section, input.track)}/.gitkeep`;
    if (view.files.has(placeholder)) b.delete(placeholder);
    return { path, newCourse: false };
  }

  let course = input.course;
  const newCourse = input.section === 'learning-notes' && input.newCourseName !== undefined;
  if (newCourse) {
    const name = (input.newCourseName ?? '').trim();
    checks.push({ id: 'course-name', label: 'Course name is filled in', ok: name.length > 0 });
    course = baseNameFor(name, 'course');
    const free = checkFileName(course, new Set(listCourses(view.files, input.track)));
    checks.push({
      id: 'course-unique',
      label: 'Course name is free',
      ok: free.ok,
      detail: free.ok
        ? undefined
        : `A course named "${course}" already exists. Try "${free.alternative}".`,
    });
    const trackKeep = `${trackFolder('learning-notes', input.track)}/.gitkeep`;
    if (view.files.has(trackKeep)) b.delete(trackKeep);
  }

  const folder = itemFolder(input.section, input.track, course);
  const base = baseNameFor(input.title.trim(), input.sectionName);
  const free = checkFileName(base, new Set(itemsIn(view.files, folder).map((i) => i.slug)));
  checks.push({
    id: 'unique',
    label: 'File name is free',
    ok: free.ok,
    detail: free.ok ? undefined : `${free.message}. Use "${free.alternative}${ext}" instead.`,
  });
  // The folder's first real file replaces its placeholder in the same commit.
  const placeholder = `${folder}/.gitkeep`;
  if (view.files.has(placeholder)) b.delete(placeholder);
  return { path: `${folder}/${base}${ext}`, course, newCourse };
}

/** The _course.json of a chapter's course after adding `chapter` (and HTML metadata). */
async function courseWithChapter(
  view: RepoView,
  input: NewItemInput,
  placement: Placement,
  html?: HtmlMeta,
): Promise<CourseConfigJson> {
  const course = placement.course as string;
  const config: CourseConfigJson = placement.newCourse
    ? { title: (input.newCourseName ?? '').trim(), description: '', order: [], html: {} }
    : await readCourse(view, input.track, course);
  const name = fileName(placement.path);
  config.order = [...(config.order ?? []).filter((f) => f !== name), name];
  if (html) config.html = { ...(config.html ?? {}), [name]: html };
  return config;
}

function courseSchemaCheck(config: CourseConfigJson): Check {
  const result = courseSchema.safeParse(config);
  return {
    id: 'course-schema',
    label: '_course.json matches the schema',
    ok: result.success,
    detail: result.success ? undefined : result.error.issues.map((i) => i.message).join('; '),
  };
}

/** Moves the item's own row to the top of the CHANGES list. */
function itemRowFirst(rows: ChangeRow[], path: string) {
  const index = rows.findIndex((r) => r.path === path);
  if (index > 0) rows.unshift(...rows.splice(index, 1));
}

// ---------------------------------------------------------------- save markdown (create or edit)

interface NewAsset {
  /** File name inside the item's assets/ folder. */
  name: string;
  bytes: Uint8Array;
}

export interface SaveInput extends NewItemInput {
  /** Path of the file being edited; absent when creating. */
  existingPath?: string;
  /** The complete file to write (front-matter with title and updated, then body). */
  fileText: string;
  /** Images uploaded while editing, written to the item's assets/ folder in the same commit. */
  assets?: NewAsset[];
}

/** Creates or updates a markdown item, with every side effect in the same commit. */
export async function planSave(view: RepoView, input: SaveInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const checks: Check[] = [];
  checks.push({ id: 'title', label: 'Title is filled in', ok: input.title.trim().length > 0 });

  let path: string;
  if (input.existingPath) {
    path = input.existingPath;
  } else {
    const placement = placeNewItem(view, b, checks, input, '.md');
    path = placement.path;
    if (input.section === 'learning-notes' && placement.course) {
      b.write(
        courseConfigPath(input.track, placement.course),
        courseJson(await courseWithChapter(view, input, placement)),
      );
    }
  }

  b.write(path, input.fileText);
  for (const asset of input.assets ?? [])
    b.write(`${parentFolder(path)}/assets/${asset.name}`, asset.bytes);
  itemRowFirst(b.rows, path);
  checks.push(...contentChecks(input.section, input.fileText));
  return b.plan(
    defaultMessage(input.section, input.existingPath ? 'update' : 'add', fileName(path)),
    checks,
    path,
  );
}

// ---------------------------------------------------------------- save HTML (upload or replace)

export interface HtmlSaveInput extends NewItemInput {
  existingPath?: string;
  /** The uploaded file: required for a new item, optional when editing (Replace). */
  file?: { name: string; bytes: Uint8Array };
  /** HTML chapters keep these in _course.json. */
  description: string;
  tags: string[];
  today: string;
}

/**
 * Uploads (or replaces) an HTML artifact. HTML chapters also get their
 * title, description, tags and updated date in _course.json.
 */
export async function planSaveHtml(view: RepoView, input: HtmlSaveInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const checks: Check[] = [];
  const isChapter = input.section === 'learning-notes';
  if (isChapter || !input.existingPath) {
    checks.push({ id: 'title', label: 'Title is filled in', ok: input.title.trim().length > 0 });
  }
  if (input.file) {
    const ok = /\.html?$/i.test(input.file.name);
    checks.push({
      id: 'html-file',
      label: 'The file is .html or .htm',
      ok,
      detail: ok ? undefined : `"${input.file.name}" is not an HTML file`,
    });
  } else if (!input.existingPath) {
    checks.push({ id: 'html-file', label: 'An HTML file is chosen', ok: false });
  }

  let path: string;
  let course = input.course;
  let placement: Placement | undefined;
  if (input.existingPath) {
    path = input.existingPath;
  } else {
    placement = placeNewItem(view, b, checks, input, '.html');
    path = placement.path;
    course = placement.course;
  }
  if (input.file) b.write(path, input.file.bytes);

  if (isChapter && course) {
    const meta: HtmlMeta = {
      title: input.title.trim(),
      description: input.description.trim(),
      tags: input.tags.map((t) => t.trim()).filter(Boolean),
      updated: input.today,
    };
    const config = placement
      ? await courseWithChapter(view, input, placement, meta)
      : await readCourse(view, input.track, course);
    if (!placement) config.html = { ...(config.html ?? {}), [fileName(path)]: meta };
    checks.push(courseSchemaCheck(config));
    b.write(courseConfigPath(input.track, course), courseJson(config));
  }

  itemRowFirst(b.rows, path);
  return b.plan(
    defaultMessage(input.section, input.existingPath ? 'update' : 'add', fileName(path)),
    checks,
    path,
  );
}

// ---------------------------------------------------------------- link fixes

export interface LinkRef {
  file: string;
  line: number;
  url: string;
}

/** A page that moves (`to`) or disappears (`to` null), given by its content file. */
export interface PageMove {
  from: string;
  to: string | null;
}

function linkTargets(moves: PageMove[]) {
  return moves.flatMap((m) => {
    const target = pageUrl(m.from);
    return target ? [{ target, replacement: m.to ? pageUrl(m.to) : null }] : [];
  });
}

/** `markdown` with every link to a moved page fixed, and where those links were. */
function fixLinks(file: string, markdown: string, targets: ReturnType<typeof linkTargets>) {
  const refs: LinkRef[] = [];
  let text = markdown;
  for (const { target, replacement } of targets) {
    const found = findLinksTo([{ file, markdown }], target);
    if (found.length === 0) continue;
    refs.push(...found);
    text = rewriteLinks(text, target, replacement).markdown;
  }
  return { text, refs };
}

/**
 * Links that would break when pages move or disappear, and the fixed text of
 * every markdown file containing them (relinked to the new address, or
 * unlinked keeping the text). Moved files and files `skip` names are left out.
 */
export async function findLinkFixes(
  view: RepoView,
  moves: PageMove[],
  skip: (path: string) => boolean = () => false,
): Promise<{ refs: LinkRef[]; fixes: Map<string, string> }> {
  const targets = linkTargets(moves);
  const refs: LinkRef[] = [];
  const fixes = new Map<string, string>();
  if (targets.length === 0) return { refs, fixes };
  const moved = new Set(moves.map((m) => m.from));
  const files = [...view.files.keys()].filter(
    (p) => p.startsWith(`${CONTENT}/`) && p.endsWith('.md') && !moved.has(p) && !skip(p),
  );
  for (const file of files) {
    const markdown = await view.read(file);
    const fixed = fixLinks(file, markdown, targets);
    refs.push(...fixed.refs);
    if (fixed.text !== markdown) fixes.set(file, fixed.text);
  }
  return { refs, fixes };
}

/** Links that would break when `path` is renamed (to `newPath`) or deleted (newPath null). */
export function findBrokenLinkFixes(view: RepoView, path: string, newPath: string | null) {
  return findLinkFixes(view, [{ from: path, to: newPath }]);
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
  checks.push({ id: 'name', label: 'New name has letters or digits', ok: slug.length > 0 });
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
  return b.plan(defaultMessage(input.section, 'rename', fileName(from), fileName(to)), checks, to);
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
  return b.plan(defaultMessage(input.section, 'delete', fileName(input.path)), [], input.path);
}

// ---------------------------------------------------------------- courses

/** Every page of a course (the course page itself and its chapters), as moves to nowhere. */
export function coursePages(view: RepoView, track: string, course: string): PageMove[] {
  const folder = courseFolder(track, course);
  return [...view.files.keys()]
    .filter(
      (p) =>
        parentFolder(p) === folder &&
        (fileName(p) === '_course.json' ||
          (!fileName(p).startsWith('_') && (p.endsWith('.md') || p.endsWith('.html')))),
    )
    .map((from) => ({ from, to: null }));
}

export interface DeleteCourseInput {
  track: string;
  course: string;
  /** Unlinked text of files linking to the course or its chapters (from findLinkFixes). */
  linkFixes?: Map<string, string>;
}

/**
 * Removes a course folder (chapters, _course.json, assets) in one commit,
 * restoring the track's .gitkeep when no other course is left.
 */
export async function planDeleteCourse(view: RepoView, input: DeleteCourseInput): Promise<Plan> {
  const folder = courseFolder(input.track, input.course);
  const b = new ChangeSetBuilder(view.files);
  const paths = [...view.files.keys()].filter((p) => p.startsWith(`${folder}/`)).sort();
  for (const path of paths) b.delete(path);
  for (const [file, text] of input.linkFixes ?? []) b.write(file, text);
  const trackDir = trackFolder('learning-notes', input.track);
  if (!folderHasFiles(view.files.keys(), trackDir, new Set(paths))) {
    b.write(`${trackDir}/.gitkeep`, '');
  }
  return b.plan(`docs(learning-notes): delete course ${input.course}`, [], folder);
}

export interface RenameCourseInput {
  track: string;
  course: string;
  /** New course name; its slug becomes the folder name. */
  newName: string;
  /** Also use the new name as the course title in _course.json. */
  setTitle: boolean;
}

/** The course's pages moved to the folder `newName` slugifies to. */
function courseMoves(view: RepoView, track: string, course: string, newName: string): PageMove[] {
  const from = courseFolder(track, course);
  const to = courseFolder(track, slugify(newName));
  return coursePages(view, track, course).map((m) => ({
    from: m.from,
    to: to + m.from.slice(from.length),
  }));
}

/**
 * Moves a course folder in one commit, rewriting links to its pages both
 * inside the course and everywhere else, and optionally its title.
 */
export async function planRenameCourse(view: RepoView, input: RenameCourseInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const checks: Check[] = [];
  const slug = slugify(input.newName.trim());
  const from = courseFolder(input.track, input.course);
  const to = courseFolder(input.track, slug);
  checks.push({ id: 'name', label: 'New name has letters or digits', ok: slug.length > 0 });
  const free = checkFileName(
    slug,
    new Set(listCourses(view.files, input.track).filter((c) => c !== input.course)),
  );
  checks.push({
    id: 'unique',
    label: 'Course name is free',
    ok: free.ok,
    detail: free.ok
      ? undefined
      : `A course named "${slug}" already exists. Try "${free.alternative}".`,
  });

  const moves = courseMoves(view, input.track, input.course, input.newName);
  const config = await readCourse(view, input.track, input.course);
  const titleChanges = input.setTitle && config.title !== input.newName.trim();
  checks.push({
    id: 'changed',
    label: 'Name or title differs from the current one',
    ok: to !== from || titleChanges,
  });

  if (checks.every((c) => c.ok)) {
    const targets = to === from ? [] : linkTargets(moves);
    const paths = [...view.files.keys()].filter((p) => p.startsWith(`${from}/`)).sort();
    for (const path of paths) {
      const target = to + path.slice(from.length);
      let content: string | undefined;
      if (fileName(path) === '_course.json' && titleChanges) {
        content = courseJson({ ...config, title: input.newName.trim() });
      } else if (path.endsWith('.md') && targets.length) {
        const original = await view.read(path);
        const fixed = fixLinks(path, original, targets).text;
        if (fixed !== original) content = fixed;
      }
      if (target !== path) b.move(path, target, content);
      else if (content !== undefined) b.write(path, content);
    }
    if (targets.length) {
      const outside = await findLinkFixes(view, moves, (p) => p.startsWith(`${from}/`));
      for (const [file, text] of outside.fixes) b.write(file, text);
    }
  }
  return b.plan(
    `docs(learning-notes): rename course ${input.course}${to !== from ? ` to ${slug}` : ''}`,
    checks,
    to,
  );
}

export interface ReorderInput {
  track: string;
  course: string;
  /** Chapter file names in the new reading order. */
  order: string[];
}

/** Saves a course's chapter order to _course.json. */
export async function planReorder(view: RepoView, input: ReorderInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const config = await readCourse(view, input.track, input.course);
  const present = new Set(
    itemsIn(view.files, courseFolder(input.track, input.course)).map((i) => i.fileName),
  );
  const same = input.order.length === present.size && input.order.every((f) => present.has(f));
  const checks: Check[] = [
    {
      id: 'order',
      label: 'Every chapter appears once',
      ok: same && new Set(input.order).size === input.order.length,
    },
  ];
  if (checks[0]?.ok) {
    config.order = input.order;
    b.write(courseConfigPath(input.track, input.course), courseJson(config));
  }
  return b.plan(
    `docs(learning-notes): reorder ${input.course}`,
    checks,
    courseConfigPath(input.track, input.course),
  );
}

// ---------------------------------------------------------------- history

export interface RestoreInput {
  section: SectionSlug;
  path: string;
  /** Blob sha of the older version. */
  sha: string;
  /** For markdown: the older text with today's `updated` (written instead of copying the blob). */
  text?: string;
  /** Short sha of the commit the version comes from (for the message). */
  from: string;
  today: string;
}

/** Writes an older version of a file as a new commit (HTML chapters also get a new updated date). */
export async function planRestore(view: RepoView, input: RestoreInput): Promise<Plan> {
  const b = new ChangeSetBuilder(view.files);
  const current = view.files.get(input.path)?.sha ?? null;
  if (input.text !== undefined) b.write(input.path, input.text);
  else b.restore(input.path, input.sha, current);
  const [, section, track = '', course = ''] = input.path.split('/');
  if (section === 'learning-notes' && input.path.endsWith('.html')) {
    const config = await readCourse(view, track, course);
    const name = fileName(input.path);
    const meta = config.html?.[name] as Record<string, unknown> | undefined;
    // Only a chapter with metadata has a date to bump (a bare entry would fail the schema).
    if (meta) {
      config.html = { ...config.html, [name]: { ...meta, updated: input.today } };
      b.write(courseConfigPath(track, course), courseJson(config));
    }
  }
  const checks: Check[] = [
    {
      id: 'different',
      label: 'The version differs from the current one',
      ok: current !== input.sha,
    },
  ];
  return b.plan(
    `${defaultMessage(input.section, 'restore', fileName(input.path))} from ${input.from}`,
    checks,
    input.path,
  );
}

/**
 * Reverts a commit's content changes: every file goes back to its version in
 * the commit's parent. It expects the files exactly as that commit left
 * them, so later work on the same files is never overwritten (that is a
 * conflict instead).
 */
export function planRevert(
  view: RepoView,
  detail: CommitDetail,
  parent: Map<string, TreeFile>,
): Plan {
  const b = new ChangeSetBuilder(view.files);
  const content = (path?: string) => Boolean(path?.startsWith(`${CONTENT}/`));
  for (const f of detail.files) {
    if (!content(f.path) && !content(f.previousPath)) continue;
    const old = parent.get(f.path);
    switch (f.status) {
      case 'added':
      case 'copied':
        if (f.sha) b.remove(f.path, f.sha);
        break;
      case 'modified':
      case 'changed':
        if (old && f.sha) b.restore(f.path, old.sha, f.sha, old.size);
        break;
      case 'removed':
        if (old) b.restore(f.path, old.sha, null, old.size);
        break;
      case 'renamed': {
        const previous = f.previousPath ? parent.get(f.previousPath) : undefined;
        if (f.sha) b.remove(f.path, f.sha);
        if (previous && f.previousPath)
          b.restore(f.previousPath, previous.sha, null, previous.size);
        break;
      }
      default:
        break;
    }
  }
  const subject = detail.message.split('\n')[0] ?? detail.sha;
  return b.plan(
    `Revert "${subject}"`,
    [{ id: 'files', label: 'There are content files to revert', ok: b.changes.length > 0 }],
    '',
  );
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
