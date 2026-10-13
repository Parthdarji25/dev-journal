import { slugify } from '../slug';
import { renderMarkdown, type RenderOptions, type Rendered } from './render';

export interface RawSection {
  title: string;
  body: string;
}

/** Splits markdown at ATX `## ` headings, ignoring anything inside fenced code. */
export function splitH2Sections(markdown: string): { intro: string; sections: RawSection[] } {
  const intro: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  let current = intro;
  let fence: string | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = null;
      }
    } else if (fence === null) {
      const heading = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
      if (heading) {
        current = [];
        sections.push({ title: (heading[1] ?? '').trim(), lines: current });
        continue;
      }
    }
    current.push(line);
  }

  return {
    intro: intro.join('\n').trim(),
    sections: sections.map((s) => ({ title: s.title, body: s.lines.join('\n').trim() })),
  };
}

export interface ComplexityInfo {
  time?: string;
  space?: string;
}

function cleanInline(text: string): string {
  return text.replace(/[`*_]/g, '').trim();
}

/** Reads "Time: ..." and "Space: ..." lines (list markers and bold allowed). */
export function parseComplexity(markdown: string): ComplexityInfo {
  const info: ComplexityInfo = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s*(?:[-*+]\s+)?\**\s*(time|space)\s*\**\s*:\s*\**\s*(.+)$/i.exec(line);
    if (!match) continue;
    const key = (match[1] ?? '').toLowerCase() as 'time' | 'space';
    info[key] ??= cleanInline(match[2] ?? '');
  }
  return info;
}

interface RenderedSection extends Rendered {
  title: string;
  id: string;
}

export interface RenderedProblem {
  intro: Rendered | null;
  problem: RenderedSection | null;
  approach: RenderedSection | null;
  solution: RenderedSection | null;
  complexity: (RenderedSection & ComplexityInfo) | null;
  /** H2 sections with any other title, in source order. */
  other: RenderedSection[];
}

async function renderSection(
  section: RawSection,
  index: number,
  options: RenderOptions,
): Promise<RenderedSection> {
  const rendered = await renderMarkdown(section.body, { ...options, eagerFirstImage: false });
  return {
    ...rendered,
    title: section.title,
    id: slugify(section.title) || `section-${index + 1}`,
  };
}

/** A 'problem' chapter: Problem, Approach, Solution and Complexity sections, each optional. */
export async function renderProblem(
  markdown: string,
  options: RenderOptions = {},
): Promise<RenderedProblem> {
  const { intro, sections } = splitH2Sections(markdown);
  const result: RenderedProblem = {
    intro: intro ? await renderMarkdown(intro, options) : null,
    problem: null,
    approach: null,
    solution: null,
    complexity: null,
    other: [],
  };
  for (const [i, section] of sections.entries()) {
    const rendered = await renderSection(section, i, options);
    const key = section.title.toLowerCase();
    if (key === 'problem' && !result.problem) result.problem = rendered;
    else if (key === 'approach' && !result.approach) result.approach = rendered;
    else if (key === 'solution' && !result.solution) result.solution = rendered;
    else if (key === 'complexity' && !result.complexity) {
      result.complexity = { ...rendered, ...parseComplexity(section.body) };
    } else result.other.push(rendered);
  }
  return result;
}

export interface RenderedCaseStudy {
  intro: Rendered | null;
  steps: RenderedSection[];
}

/** A 'case-study' chapter: every H2 section is one step. */
export async function renderCaseStudy(
  markdown: string,
  options: RenderOptions = {},
): Promise<RenderedCaseStudy> {
  const { intro, sections } = splitH2Sections(markdown);
  const steps: RenderedSection[] = [];
  const used = new Set<string>();
  for (const [i, section] of sections.entries()) {
    const step = await renderSection(section, i, options);
    let id = step.id;
    for (let n = 2; used.has(id); n++) id = `${step.id}-${n}`;
    used.add(id);
    steps.push({ ...step, id });
  }
  return { intro: intro ? await renderMarkdown(intro, options) : null, steps };
}
