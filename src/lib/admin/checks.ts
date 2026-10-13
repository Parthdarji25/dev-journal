/**
 * The CHECKS list of the editor: the same zod schemas the build and
 * `pnpm validate` use, plus the section-specific parsers.
 */
import type { z } from 'zod';
import { ContentError } from '@/lib/content/errors';
import { parseFrontmatter } from '@/lib/content/frontmatter';
import { parseResources } from '@/lib/content/markdown/parse';
import {
  chapterFrontmatterSchema,
  cheatSheetFrontmatterSchema,
  mindMapFrontmatterSchema,
  questionFrontmatterSchema,
  resourcesFrontmatterSchema,
  roadmapFrontmatterSchema,
} from '@/lib/schema';
import type { SectionSlug } from '@/lib/schema/meta';

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  /** Why it failed, in plain words. */
  detail?: string;
}

const SCHEMAS: Record<SectionSlug, z.ZodType<unknown>> = {
  'learning-notes': chapterFrontmatterSchema,
  roadmaps: roadmapFrontmatterSchema,
  'mind-maps': mindMapFrontmatterSchema,
  'interview-questions': questionFrontmatterSchema,
  'cheat-sheets': cheatSheetFrontmatterSchema,
  resources: resourcesFrontmatterSchema,
};

/** Checks of a markdown file's own content. */
export function contentChecks(section: SectionSlug, fileText: string): Check[] {
  const checks: Check[] = [];
  let body = '';
  try {
    body = parseFrontmatter(fileText, SCHEMAS[section], 'file').body;
    checks.push({ id: 'schema', label: 'Front-matter matches the schema', ok: true });
  } catch (error) {
    const detail =
      error instanceof ContentError ? error.problems.join('; ') : (error as Error).message;
    checks.push({ id: 'schema', label: 'Front-matter matches the schema', ok: false, detail });
  }
  if (section === 'resources') {
    const { problems } = parseResources(body);
    checks.push({
      id: 'resources',
      label: 'Every resource line is "[Title](url) - type: docs|course|video|book - note"',
      ok: problems.length === 0,
      detail: problems.join('; ') || undefined,
    });
  }
  return checks;
}

/** All checks pass. */
export function allPass(checks: Check[]): boolean {
  return checks.every((c) => c.ok);
}
