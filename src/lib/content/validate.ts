import path from 'node:path';
import { KEBAB_RE, NUMBER_PREFIX_RE, SECTION_SLUGS, type SectionSlug } from '@/lib/schema';
import { ContentError, type ContentIssue } from './errors';
import { listEntries, relative } from './fs';
import { findBrokenLinks } from './links';
import { loadContent, loadSections, loadTracks } from './load';
import { stem } from './slug';
import type { Content } from './types';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

/** Item file extensions allowed in each section. */
const EXTENSIONS: Record<SectionSlug, string[]> = {
  'learning-notes': ['.md', '.html'],
  roadmaps: ['.md'],
  'mind-maps': ['.md', '.html'],
  'interview-questions': ['.md'],
  'cheat-sheets': ['.md', '.html'],
  resources: ['.md'],
};

/** Sections stored as one file per track rather than a folder per track. */
const FILE_PER_TRACK: SectionSlug[] = ['roadmaps', 'resources'];

export function fileNameProblem(name: string): string | null {
  const base = stem(name);
  if (name !== name.toLowerCase()) return 'file names must be lowercase';
  if (NUMBER_PREFIX_RE.test(base))
    return 'file names must not start with a number prefix (order lives in config)';
  if (!KEBAB_RE.test(base)) return 'file names must be lowercase-kebab-case (a-z, 0-9 and dashes)';
  return null;
}

function checkAssets(root: string, dir: string, issues: ContentIssue[]) {
  for (const e of listEntries(dir)) {
    const rel = relative(root, path.join(dir, e.name));
    if (e.name === '.gitkeep') continue;
    if (e.isDir) {
      issues.push({ file: rel, message: 'assets/ folders must not contain sub-folders' });
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      issues.push({
        file: rel,
        message: `only images (${IMAGE_EXTENSIONS.join(', ')}) belong in assets/`,
      });
    }
    const problem = fileNameProblem(e.name);
    if (problem) issues.push({ file: rel, message: problem });
  }
}

/** Files of one item folder: allowed extensions, valid names, an optional assets/ folder. */
function checkItemFolder(
  root: string,
  dir: string,
  section: SectionSlug,
  issues: ContentIssue[],
  allowConfig: string[] = [],
) {
  for (const e of listEntries(dir)) {
    const full = path.join(dir, e.name);
    const rel = relative(root, full);
    if (e.name === '.gitkeep' || allowConfig.includes(e.name)) continue;
    if (e.isDir) {
      if (e.name === 'assets') checkAssets(root, full, issues);
      else issues.push({ file: rel, message: `unexpected folder in ${section}` });
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (!EXTENSIONS[section].includes(ext)) {
      issues.push({
        file: rel,
        message: `${section} only holds ${EXTENSIONS[section].join(' or ')} files`,
      });
      continue;
    }
    const problem = fileNameProblem(e.name);
    if (problem) issues.push({ file: rel, message: problem });
  }
}

/**
 * Folder layout rules: known sections and tracks only, kebab-case names,
 * allowed extensions. Returns one issue per problem, naming the path.
 */
function checkStructure(root: string, trackSlugs: string[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const tracks = new Set(trackSlugs);

  for (const e of listEntries(root)) {
    if (e.name === '_meta' || e.name === '.gitkeep') continue;
    if (!e.isDir) {
      issues.push({ file: e.name, message: 'files are not allowed at the top of content/' });
      continue;
    }
    if (!(SECTION_SLUGS as readonly string[]).includes(e.name)) {
      issues.push({
        file: e.name,
        message: `unknown section folder "${e.name}" (expected one of: ${SECTION_SLUGS.join(', ')})`,
      });
      continue;
    }
    const section = e.name as SectionSlug;
    const sectionDir = path.join(root, section);

    if (FILE_PER_TRACK.includes(section)) {
      for (const f of listEntries(sectionDir)) {
        const rel = `${section}/${f.name}`;
        if (f.name === '.gitkeep') continue;
        if (f.isDir) {
          if (f.name === 'assets') checkAssets(root, path.join(sectionDir, f.name), issues);
          else
            issues.push({
              file: rel,
              message: `unexpected folder "${f.name}": ${section} holds one <track>.md per track`,
            });
        } else if (!f.name.endsWith('.md') || !tracks.has(stem(f.name))) {
          issues.push({
            file: rel,
            message: `unknown track file "${f.name}": expected <track>.md for a track in tracks.json`,
          });
        }
      }
      continue;
    }

    for (const t of listEntries(sectionDir)) {
      const rel = `${section}/${t.name}`;
      if (t.name === '.gitkeep') continue;
      if (!t.isDir) {
        issues.push({ file: rel, message: `files belong in a track folder: ${section}/<track>/` });
        continue;
      }
      if (!tracks.has(t.name)) {
        issues.push({
          file: rel,
          message: `unknown track folder "${t.name}" (not in _meta/tracks.json)`,
        });
        continue;
      }
      const trackDir = path.join(sectionDir, t.name);
      if (section !== 'learning-notes') {
        checkItemFolder(root, trackDir, section, issues);
        continue;
      }
      for (const c of listEntries(trackDir)) {
        const crel = `${rel}/${c.name}`;
        if (c.name === '.gitkeep') continue;
        if (!c.isDir) {
          issues.push({
            file: crel,
            message: 'chapters belong in a course folder: learning-notes/<track>/<course>/',
          });
        } else if (c.name !== 'assets') {
          const problem = fileNameProblem(c.name);
          if (problem)
            issues.push({
              file: crel,
              message: problem.replace('file names', 'course folder names'),
            });
          checkItemFolder(root, path.join(trackDir, c.name), section, issues, ['_course.json']);
        }
      }
    }
  }
  return issues;
}

export interface ValidationReport {
  errors: ContentIssue[];
  warnings: ContentIssue[];
  content?: Content;
}

/** Everything `pnpm validate` checks: meta files, structure, every file's schema and internal links. */
export function validateContent(root: string): ValidationReport {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const fromError = (e: ContentError) => {
    for (const message of e.problems) errors.push({ file: e.file, message });
  };

  let trackSlugs: string[];
  try {
    trackSlugs = loadTracks(root).map((t) => t.slug);
    loadSections(root);
  } catch (error) {
    if (error instanceof ContentError) {
      fromError(error);
      return { errors, warnings };
    }
    throw error;
  }

  errors.push(...checkStructure(root, trackSlugs));
  const content = loadContent(root, { onError: fromError, onWarning: (w) => warnings.push(w) });
  for (const link of findBrokenLinks(root, content)) {
    errors.push({
      file: `${link.file}:${link.line}`,
      message: `broken link "${link.url}": ${link.reason}`,
    });
  }
  return { errors, warnings, content };
}
