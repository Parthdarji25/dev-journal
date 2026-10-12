import path from 'node:path';
import {
  chapterFrontmatterSchema,
  cheatSheetFrontmatterSchema,
  courseSchema,
  mindMapFrontmatterSchema,
  questionFrontmatterSchema,
  resourcesFrontmatterSchema,
  roadmapFrontmatterSchema,
  sectionsSchema,
  tracksSchema,
  type Section,
  type Track,
} from '@/lib/schema';
import { ContentError, throwOnError, type ContentIssue, type OnContentError } from './errors';
import { htmlTitle, parseFrontmatter, parseJson } from './frontmatter';
import { contentDir, exists, isItemFile, listEntries, readText, relative } from './fs';
import { parseCheatSheet, parseMindMap, parseResources, parseRoadmapSteps } from './markdown/parse';
import { routes } from './routes';
import { humanize, stem } from './slug';
import type {
  Chapter,
  CheatSheet,
  Content,
  Course,
  MindMap,
  Question,
  ResourceList,
  Roadmap,
} from './types';

export interface LoadOptions {
  /** Called for each invalid file; the default throws so the build fails. */
  onError?: OnContentError;
  /** Called for things that load fine but deserve attention. */
  onWarning?: (issue: ContentIssue) => void;
}

interface Ctx {
  root: string;
  tracks: Track[];
  report: OnContentError;
  warn: (issue: ContentIssue) => void;
}

/** Runs `fn`, sending a ContentError to the reporter and returning undefined instead. */
function guard<T>(ctx: Ctx, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ContentError) {
      ctx.report(error);
      return undefined;
    }
    throw error;
  }
}

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function latest(dates: (string | undefined)[]): string | undefined {
  return dates.filter(defined).sort().at(-1);
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function loadTracks(root = contentDir()): Track[] {
  const file = '_meta/tracks.json';
  const full = path.join(root, file);
  if (!exists(full)) throw new ContentError(file, ['file is missing']);
  return [...parseJson(readText(full), tracksSchema, file)].sort(byOrder);
}

export function loadSections(root = contentDir()): Section[] {
  const file = '_meta/sections.json';
  const full = path.join(root, file);
  if (!exists(full)) throw new ContentError(file, ['file is missing']);
  return [...parseJson(readText(full), sectionsSchema, file)].sort(byOrder);
}

// ---------------------------------------------------------------- learning notes

function loadCourse(ctx: Ctx, track: string, courseSlug: string): Course {
  const folder = path.join(ctx.root, 'learning-notes', track, courseSlug);
  const rel = relative(ctx.root, folder);
  const configRel = `${rel}/_course.json`;
  const configPath = path.join(folder, '_course.json');
  if (!exists(configPath)) throw new ContentError(rel, ['course folder has no _course.json']);
  const config = parseJson(readText(configPath), courseSchema, configRel);

  const files = listEntries(folder)
    .filter(isItemFile)
    .map((e) => e.name)
    .filter((name) => name.endsWith('.md') || name.endsWith('.html'));
  const present = new Set(files);

  for (const listed of config.order) {
    if (!present.has(listed)) {
      ctx.report(
        new ContentError(configRel, [`order lists "${listed}" but the file does not exist`]),
      );
    }
  }
  for (const key of Object.keys(config.html)) {
    if (!present.has(key)) {
      ctx.report(
        new ContentError(configRel, [`html has an entry for "${key}" but the file does not exist`]),
      );
    }
  }
  const unlisted = files.filter((f) => !config.order.includes(f));
  for (const f of unlisted) {
    ctx.warn({ file: `${rel}/${f}`, message: 'not listed in _course.json "order", shown last' });
  }

  const seenSlugs = new Set<string>();
  const chapters = [...config.order.filter((f) => present.has(f)), ...unlisted]
    .map((fileName) =>
      guard(ctx, (): Chapter => {
        const slug = stem(fileName);
        const fileRel = `${rel}/${fileName}`;
        if (seenSlugs.has(slug)) {
          throw new ContentError(fileRel, [
            `another chapter in this course is also named "${slug}"`,
          ]);
        }
        seenSlugs.add(slug);
        const base = {
          track,
          course: courseSlug,
          slug,
          file: fileRel,
          fileName,
          href: routes.chapter(track, courseSlug, slug),
        };
        if (fileName.endsWith('.html')) {
          const meta = config.html[fileName];
          if (!meta) {
            throw new ContentError(configRel, [
              `html."${fileName}" is missing: every HTML chapter needs a title in _course.json`,
            ]);
          }
          return {
            ...base,
            format: 'html',
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            updated: meta.updated,
            type: 'note',
            companies: [],
            body: '',
          };
        }
        const { data, body } = parseFrontmatter(
          readText(path.join(folder, fileName)),
          chapterFrontmatterSchema,
          fileRel,
        );
        return {
          ...base,
          format: 'md',
          title: data.title,
          description: data.description ?? '',
          tags: data.tags,
          type: data.type,
          difficulty: data.difficulty,
          companies: data.companies,
          topic: data.topic,
          updated: data.updated,
          body,
        };
      }),
    )
    .filter(defined);

  return {
    track,
    slug: courseSlug,
    folder: rel,
    title: config.title,
    description: config.description,
    chapters,
    updated: latest(chapters.map((c) => c.updated)),
    href: routes.course(track, courseSlug),
  };
}

function loadCourses(ctx: Ctx): Course[] {
  return ctx.tracks.flatMap((track) =>
    listEntries(path.join(ctx.root, 'learning-notes', track.slug))
      .filter((e) => e.isDir && e.name !== 'assets')
      .map((e) => guard(ctx, () => loadCourse(ctx, track.slug, e.name)))
      .filter(defined)
      .sort((a, b) => a.title.localeCompare(b.title)),
  );
}

// ---------------------------------------------------------------- per-track folders

/** Item files of `<section>/<track>/` with the given extensions. */
function trackFiles(ctx: Ctx, section: string, track: string, extensions: string[]) {
  const dir = path.join(ctx.root, section, track);
  return listEntries(dir)
    .filter(isItemFile)
    .filter((e) => extensions.some((ext) => e.name.endsWith(ext)))
    .map((e) => ({
      fileName: e.name,
      slug: stem(e.name),
      full: path.join(dir, e.name),
      rel: `${section}/${track}/${e.name}`,
    }));
}

function loadMindMaps(ctx: Ctx): MindMap[] {
  return ctx.tracks.flatMap((track) =>
    trackFiles(ctx, 'mind-maps', track.slug, ['.md', '.html'])
      .map((f) =>
        guard(ctx, (): MindMap => {
          const base = {
            track: track.slug,
            slug: f.slug,
            file: f.rel,
            href: routes.mindMap(track.slug, f.slug),
          };
          if (f.fileName.endsWith('.html')) {
            return {
              ...base,
              format: 'html',
              title: htmlTitle(readText(f.full)) ?? humanize(f.slug),
            };
          }
          const { data, body } = parseFrontmatter(
            readText(f.full),
            mindMapFrontmatterSchema,
            f.rel,
          );
          return {
            ...base,
            format: 'md',
            title: data.title,
            updated: data.updated,
            root: parseMindMap(body, data.title),
          };
        }),
      )
      .filter(defined),
  );
}

function loadQuestions(ctx: Ctx): Question[] {
  return ctx.tracks.flatMap((track) =>
    trackFiles(ctx, 'interview-questions', track.slug, ['.md'])
      .map((f) =>
        guard(ctx, (): Question => {
          const { data, body } = parseFrontmatter(
            readText(f.full),
            questionFrontmatterSchema,
            f.rel,
          );
          return {
            track: track.slug,
            slug: f.slug,
            file: f.rel,
            href: routes.question(track.slug, f.slug),
            title: data.question,
            question: data.question,
            difficulty: data.difficulty,
            companies: data.companies,
            tags: data.tags,
            updated: data.updated,
            body,
          };
        }),
      )
      .filter(defined),
  );
}

function loadCheatSheets(ctx: Ctx): CheatSheet[] {
  return ctx.tracks.flatMap((track) =>
    trackFiles(ctx, 'cheat-sheets', track.slug, ['.md', '.html'])
      .map((f) =>
        guard(ctx, (): CheatSheet => {
          const base = {
            track: track.slug,
            slug: f.slug,
            file: f.rel,
            href: routes.cheatSheet(track.slug, f.slug),
          };
          if (f.fileName.endsWith('.html')) {
            const title = htmlTitle(readText(f.full)) ?? humanize(f.slug);
            return { ...base, format: 'html', title, description: '', groups: [] };
          }
          const { data, body } = parseFrontmatter(
            readText(f.full),
            cheatSheetFrontmatterSchema,
            f.rel,
          );
          return {
            ...base,
            format: 'md',
            title: data.title,
            description: data.description ?? '',
            updated: data.updated,
            groups: parseCheatSheet(body),
          };
        }),
      )
      .filter(defined),
  );
}

// ---------------------------------------------------------------- one file per track

function trackFile(ctx: Ctx, section: string, track: string) {
  const rel = `${section}/${track}.md`;
  const full = path.join(ctx.root, rel);
  return exists(full) ? { rel, full } : undefined;
}

function loadRoadmaps(ctx: Ctx): Roadmap[] {
  return ctx.tracks
    .map((track) => {
      const f = trackFile(ctx, 'roadmaps', track.slug);
      if (!f) return undefined;
      return guard(ctx, (): Roadmap => {
        const { data, body } = parseFrontmatter(readText(f.full), roadmapFrontmatterSchema, f.rel);
        return {
          track: track.slug,
          slug: track.slug,
          file: f.rel,
          href: routes.sectionTrack('roadmaps', track.slug),
          title: data.title,
          updated: data.updated,
          steps: parseRoadmapSteps(body),
        };
      });
    })
    .filter(defined);
}

function loadResources(ctx: Ctx): ResourceList[] {
  return ctx.tracks
    .map((track) => {
      const f = trackFile(ctx, 'resources', track.slug);
      if (!f) return undefined;
      return guard(ctx, (): ResourceList => {
        const { data, body } = parseFrontmatter(
          readText(f.full),
          resourcesFrontmatterSchema,
          f.rel,
        );
        const { links, problems } = parseResources(body);
        if (problems.length) ctx.report(new ContentError(f.rel, problems));
        return {
          track: track.slug,
          slug: track.slug,
          file: f.rel,
          href: routes.sectionTrack('resources', track.slug),
          title: data.title,
          updated: data.updated,
          links,
        };
      });
    })
    .filter(defined);
}

/** Loads and validates everything under the content root. Empty folders give empty lists. */
export function loadContent(root = contentDir(), options: LoadOptions = {}): Content {
  const tracks = loadTracks(root);
  const sections = loadSections(root);
  const ctx: Ctx = {
    root,
    tracks,
    report: options.onError ?? throwOnError,
    warn: options.onWarning ?? (() => {}),
  };
  return {
    tracks,
    sections,
    courses: loadCourses(ctx),
    roadmaps: loadRoadmaps(ctx),
    mindMaps: loadMindMaps(ctx),
    questions: loadQuestions(ctx),
    cheatSheets: loadCheatSheets(ctx),
    resources: loadResources(ctx),
  };
}
