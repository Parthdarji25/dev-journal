// Browser-safe link helpers, shared by the link checker and the admin panel.
import { extractLinks } from './markdown/parse';
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

/** Markdown sources that link to `target` (a page path). Used before renames and deletes. */
export function findLinksTo(
  files: { file: string; markdown: string }[],
  target: string,
): { file: string; line: number; url: string }[] {
  const wanted = normalizePath(target);
  return files.flatMap(({ file, markdown }) =>
    extractLinks(markdown)
      .filter((l) => l.url.startsWith('/') && normalizePath(l.url) === wanted)
      .map((l) => ({ file, line: l.line, url: l.url })),
  );
}
