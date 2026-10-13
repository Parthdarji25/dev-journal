/**
 * Where things live in the repository, seen from the admin (browser-safe).
 */
import type { TreeFile } from '@/lib/github/client';
import { stem } from '@/lib/content/slug';
import type { SectionSlug } from '@/lib/schema/meta';

export const CONTENT = 'content';

/** Sections stored as one <track>.md file instead of a folder per track. */
export const PER_TRACK_FILE: readonly SectionSlug[] = ['roadmaps', 'resources'];

/** Sections whose items may be uploaded HTML artifacts. */
export const HTML_SECTIONS: readonly SectionSlug[] = [
  'learning-notes',
  'mind-maps',
  'cheat-sheets',
];

export const isPerTrackFile = (section: SectionSlug) => PER_TRACK_FILE.includes(section);

/** content/<section>/<track> (or content/<section> for roadmaps and resources). */
export function trackFolder(section: SectionSlug, track: string): string {
  return isPerTrackFile(section) ? `${CONTENT}/${section}` : `${CONTENT}/${section}/${track}`;
}

export function courseFolder(track: string, course: string): string {
  return `${CONTENT}/learning-notes/${track}/${course}`;
}

export function courseConfigPath(track: string, course: string): string {
  return `${courseFolder(track, course)}/_course.json`;
}

/** The folder new items of this list are written to. */
export function itemFolder(section: SectionSlug, track: string, course?: string): string {
  if (section === 'learning-notes') {
    if (!course) throw new Error('Learning Notes items need a course');
    return courseFolder(track, course);
  }
  return trackFolder(section, track);
}

export function perTrackFilePath(section: SectionSlug, track: string): string {
  return `${CONTENT}/${section}/${track}.md`;
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function parentFolder(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export interface ItemRef {
  path: string;
  fileName: string;
  slug: string;
  format: 'md' | 'html';
  sha: string;
  size: number;
}

function toItem(file: TreeFile): ItemRef {
  const name = fileName(file.path);
  return {
    path: file.path,
    fileName: name,
    slug: stem(name),
    format: name.endsWith('.html') ? 'html' : 'md',
    sha: file.sha,
    size: file.size,
  };
}

/** Item files directly inside `folder` (no config, placeholders or assets). */
export function itemsIn(files: Map<string, TreeFile>, folder: string): ItemRef[] {
  const items: ItemRef[] = [];
  for (const file of files.values()) {
    if (parentFolder(file.path) !== folder) continue;
    const name = fileName(file.path);
    if (name.startsWith('_') || name.startsWith('.')) continue;
    if (!name.endsWith('.md') && !name.endsWith('.html')) continue;
    items.push(toItem(file));
  }
  return items.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/** The items of one admin list: a course's chapters, a track's files, or a track's single file. */
export function listItems(
  files: Map<string, TreeFile>,
  section: SectionSlug,
  track: string,
  course?: string,
): ItemRef[] {
  if (isPerTrackFile(section)) {
    const file = files.get(perTrackFilePath(section, track));
    return file ? [toItem(file)] : [];
  }
  if (section === 'learning-notes')
    return course ? itemsIn(files, courseFolder(track, course)) : [];
  return itemsIn(files, trackFolder(section, track));
}

/** Course folder names of a track (folders with a _course.json). */
export function listCourses(files: Map<string, TreeFile>, track: string): string[] {
  const prefix = `${CONTENT}/learning-notes/${track}/`;
  const courses = new Set<string>();
  for (const path of files.keys()) {
    if (!path.startsWith(prefix) || !path.endsWith('/_course.json')) continue;
    const rest = path.slice(prefix.length).split('/');
    if (rest.length === 2 && rest[0]) courses.add(rest[0]);
  }
  return [...courses].sort();
}

/** Number of items per section for one track (courses for Learning Notes, 0/1 for one-file sections). */
export function sectionCounts(
  files: Map<string, TreeFile>,
  sections: readonly SectionSlug[],
  track: string,
): Record<string, number> {
  return Object.fromEntries(
    sections.map((s) => [
      s,
      s === 'learning-notes' ? listCourses(files, track).length : listItems(files, s, track).length,
    ]),
  );
}

/** Whether anything other than `ignored` paths is left inside `folder`. */
export function folderHasFiles(
  files: Iterable<string>,
  folder: string,
  ignored: ReadonlySet<string> = new Set(),
): boolean {
  for (const path of files) {
    if (path.startsWith(`${folder}/`) && !ignored.has(path)) return true;
  }
  return false;
}

/** The public page address of a content file, or null when it has none. */
export function pageUrl(path: string): string | null {
  const parts = path.split('/');
  if (parts[0] !== CONTENT) return null;
  const [, section, a, b, c] = parts;
  const strip = (name = '') => stem(name);
  switch (section) {
    case 'learning-notes':
      if (!a || !b) return null;
      if (c === '_course.json') return `/learning-notes/${a}/${b}`;
      return c ? `/learning-notes/${a}/${b}/${strip(c)}` : null;
    case 'mind-maps':
    case 'cheat-sheets':
      return a && b ? `/${section}/${a}/${strip(b)}` : null;
    case 'interview-questions':
      return a && b ? `/interview-questions/${a}#${strip(b)}` : null;
    case 'roadmaps':
      return a ? `/roadmap/${strip(a)}` : null;
    case 'resources':
      return a ? `/resources/${strip(a)}` : null;
    default:
      return null;
  }
}
