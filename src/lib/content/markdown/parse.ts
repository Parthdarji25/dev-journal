/**
 * Structured parsers for the list- and table-based formats. They work on the
 * markdown AST only (no rendering), so they are also safe to run in the admin.
 */
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { RESOURCE_TYPES, resourceLinkSchema, type ResourceLink } from '@/lib/schema';
import { zodProblems } from '../errors';
import { toText, walk, type MdNode } from './tree';

const parser = unified().use(remarkParse).use(remarkGfm);

export function parseMdast(markdown: string): MdNode {
  return parser.parse(markdown) as unknown as MdNode;
}

function inlineText(node: MdNode | undefined): string {
  return toText(node).replace(/\s+/g, ' ').trim();
}

function firstParagraph(item: MdNode): MdNode | undefined {
  return item.children?.find((c) => c.type === 'paragraph');
}

const SEPARATOR_EDGES = /^[\s\-–—:|]+|[\s\-–—:|]+$/g;

// ---------------------------------------------------------------- roadmaps

export interface RoadmapStep {
  title: string;
  description: string;
  link?: { href: string; label: string };
}

/** `1. **Step title** - one-line description [notes](/learning-notes/...)` */
export function parseRoadmapSteps(markdown: string): RoadmapStep[] {
  const root = parseMdast(markdown);
  const list = root.children?.find((c) => c.type === 'list');
  const steps: RoadmapStep[] = [];
  for (const item of list?.children ?? []) {
    const para = firstParagraph(item);
    if (!para?.children?.length) continue;
    const strong = para.children.find((c) => c.type === 'strong');
    const link = para.children.find((c) => c.type === 'link');
    const rest = para.children.filter((c) => c !== strong && c !== link);
    let title = inlineText(strong);
    let description = rest
      .map(inlineText)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(SEPARATOR_EDGES, '');
    if (!title) {
      // No bold title: "Title - description".
      const [head = '', ...tail] = description.split(/\s+[-–—]\s+/);
      title = head.trim();
      description = tail.join(' - ').trim();
    }
    if (!title) continue;
    const step: RoadmapStep = { title, description };
    if (link?.url) step.link = { href: link.url, label: inlineText(link) || 'Notes' };
    steps.push(step);
  }
  return steps;
}

// ---------------------------------------------------------------- mind maps

export interface MindNode {
  title: string;
  children: MindNode[];
}

function listToNodes(list: MdNode): MindNode[] {
  return (list.children ?? []).flatMap((item) => {
    const title = inlineText(firstParagraph(item));
    const nested = (item.children ?? []).filter((c) => c.type === 'list').flatMap(listToNodes);
    if (!title) return nested;
    return [{ title, children: nested }];
  });
}

/** H1 = root, H2 = branches (H3+ nest under them), list items = leaves. */
export function parseMindMap(markdown: string, fallbackTitle: string): MindNode {
  const root: MindNode = { title: fallbackTitle, children: [] };
  // stack[d] is the node that headings of depth d+1 and lists attach to.
  const stack: MindNode[] = [root];
  let sawH1 = false;
  for (const node of parseMdast(markdown).children ?? []) {
    if (node.type === 'heading') {
      const depth = node.depth ?? 1;
      const title = inlineText(node);
      if (depth === 1) {
        if (!sawH1 && title) root.title = title;
        sawH1 = true;
        stack.length = 1;
        continue;
      }
      const parentDepth = Math.min(depth - 2, stack.length - 1);
      const parent = stack[parentDepth] ?? root;
      const branch: MindNode = { title, children: [] };
      parent.children.push(branch);
      stack.length = parentDepth + 1;
      stack.push(branch);
    } else if (node.type === 'list') {
      (stack[stack.length - 1] ?? root).children.push(...listToNodes(node));
    }
  }
  return root;
}

// ---------------------------------------------------------------- cheat sheets

interface CheatRow {
  code: string;
  description: string;
}

export interface CheatGroup {
  title: string;
  rows: CheatRow[];
}

/** H2 groups, each followed by a `| Code | What it does |` table. */
export function parseCheatSheet(markdown: string): CheatGroup[] {
  const groups: CheatGroup[] = [];
  let current: CheatGroup | undefined;
  for (const node of parseMdast(markdown).children ?? []) {
    if (node.type === 'heading' && node.depth === 2) {
      current = { title: inlineText(node), rows: [] };
      groups.push(current);
    } else if (node.type === 'table') {
      if (!current) {
        current = { title: '', rows: [] };
        groups.push(current);
      }
      for (const row of (node.children ?? []).slice(1)) {
        const [codeCell, descCell] = row.children ?? [];
        const code = toText(codeCell).trim();
        const description = inlineText(descCell);
        if (code || description) current.rows.push({ code, description });
      }
    }
  }
  return groups;
}

// ---------------------------------------------------------------- resources

export interface ParsedResource extends ResourceLink {
  domain: string;
}

export interface ResourceParseResult {
  links: ParsedResource[];
  /** Problems with individual lines: "line N: message". */
  problems: string[];
}

/** `- [Title](url) - type: docs - short note` */
export function parseResources(markdown: string): ResourceParseResult {
  const links: ParsedResource[] = [];
  const problems: string[] = [];
  for (const list of (parseMdast(markdown).children ?? []).filter((c) => c.type === 'list')) {
    for (const item of list.children ?? []) {
      const line = item.position?.start.line ?? 0;
      const para = firstParagraph(item);
      const link = para?.children?.find((c) => c.type === 'link');
      if (!para || !link) {
        problems.push(`line ${line}: each resource must start with a [Title](url) link`);
        continue;
      }
      const rest = (para.children ?? [])
        .filter((c) => c !== link)
        .map(inlineText)
        .join(' ')
        .replace(SEPARATOR_EDGES, '');
      const parts = rest
        .split(/\s+[-–—]\s+|^[-–—]\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const typeIndex = parts.findIndex((p) => /^type\s*:/i.test(p));
      const type =
        typeIndex >= 0 ? (parts[typeIndex] ?? '').replace(/^type\s*:\s*/i, '').toLowerCase() : '';
      const note = parts.filter((_, i) => i !== typeIndex).join(' - ');
      const parsed = resourceLinkSchema.safeParse({
        title: inlineText(link),
        url: link.url,
        type,
        note,
      });
      if (!parsed.success) {
        const detail = type
          ? zodProblems(parsed.error).join('; ')
          : `type is required (${RESOURCE_TYPES.join(', ')})`;
        problems.push(`line ${line}: ${detail}`);
        continue;
      }
      links.push({
        ...parsed.data,
        domain: new URL(parsed.data.url).hostname.replace(/^www\./, ''),
      });
    }
  }
  return { links, problems };
}

// ---------------------------------------------------------------- links

export interface MarkdownLink {
  url: string;
  /** 1-based line within the markdown that was parsed. */
  line: number;
}

/** Every link and link reference definition (images excluded). */
export function extractLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  walk(parseMdast(markdown), (node) => {
    if ((node.type === 'link' || node.type === 'definition') && node.url) {
      links.push({ url: node.url, line: node.position?.start.line ?? 0 });
    }
  });
  return links;
}
