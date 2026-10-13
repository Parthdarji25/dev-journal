// Browser-safe link helpers, shared by the link checker and the admin panel.
import { extractLinks, parseMdast } from './markdown/parse';
import { walk, type MdNode } from './markdown/tree';
import { normalizePath } from './routes';

/**
 * Checks a single link. Only site links are judged: absolute paths ("/...")
 * must be pages the build emits, and links to ".md" files are rejected
 * because readers never see file paths. External, mailto and "#" links pass.
 */
export function checkLink(url: string, pages: ReadonlySet<string>): string | null {
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    return null;
  }
  if (trimmed.startsWith('/')) {
    return pages.has(normalizePath(trimmed)) ? null : 'no page at this address';
  }
  if (/\.md(?:[?#]|$)/i.test(trimmed)) {
    return 'link to the page address (e.g. /learning-notes/<track>/<course>/<chapter>), not the .md file';
  }
  return null;
}

function hashOf(url: string): string {
  const i = url.indexOf('#');
  return i === -1 ? '' : url.slice(i + 1);
}

/**
 * Whether `url` points at `target`. A target with a "#anchor" (an interview
 * question) matches only that anchor; otherwise any anchor on the page matches.
 */
export function linksTo(url: string, target: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  if (normalizePath(url) !== normalizePath(target)) return false;
  return !target.includes('#') || hashOf(url) === hashOf(target);
}

/** Markdown sources that link to `target` (a page address). Used before renames and deletes. */
export function findLinksTo(
  files: { file: string; markdown: string }[],
  target: string,
): { file: string; line: number; url: string }[] {
  return files.flatMap(({ file, markdown }) =>
    extractLinks(markdown)
      .filter((l) => linksTo(l.url, target))
      .map((l) => ({ file, line: l.line, url: l.url })),
  );
}

interface Positioned extends MdNode {
  position?: { start: { line: number; column: number; offset?: number }; end: { offset?: number } };
}

/** The new address for `url`: keeps its own #anchor/query unless the target named one. */
function replaceUrl(url: string, target: string, replacement: string): string {
  if (target.includes('#')) return replacement;
  const suffix = url.slice(url.search(/[?#]|$/));
  return `${normalizePath(replacement)}${suffix}`;
}

/**
 * Points every link to `target` at `replacement`, or (replacement null)
 * unlinks them, keeping the link text. Returns the new markdown and how many
 * links changed.
 */
export function rewriteLinks(
  markdown: string,
  target: string,
  replacement: string | null,
): { markdown: string; count: number } {
  const edits: { start: number; end: number; text: string }[] = [];
  walk(parseMdast(markdown) as Positioned, (node) => {
    const n = node as Positioned;
    if ((n.type !== 'link' && n.type !== 'definition') || !n.url || !linksTo(n.url, target)) return;
    const start = n.position?.start.offset;
    const end = n.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const source = markdown.slice(start, end);

    if (replacement !== null) {
      const children = (n.children ?? []) as Positioned[];
      const textEnd = (children.at(-1)?.position?.end.offset ?? start) - start;
      const at = source.indexOf(n.url, textEnd);
      if (at === -1) return;
      const updated = replaceUrl(n.url, target, replacement);
      edits.push({ start: start + at, end: start + at + n.url.length, text: updated });
    } else if (n.type === 'link') {
      const children = (n.children ?? []) as Positioned[];
      const first = children[0]?.position?.start.offset;
      const last = children.at(-1)?.position?.end.offset;
      const text = first !== undefined && last !== undefined ? markdown.slice(first, last) : '';
      edits.push({ start, end, text });
    } else {
      // A reference definition to a removed page: drop the whole line.
      const lineEnd = markdown.indexOf('\n', end);
      edits.push({ start, end: lineEnd === -1 ? end : lineEnd + 1, text: '' });
    }
    return 'skip';
  });

  let result = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return { markdown: result, count: edits.length };
}
