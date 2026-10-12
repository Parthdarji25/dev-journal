import matter from 'gray-matter';
import path from 'node:path';
import { listEntries, readText, relative } from './fs';
import { extractLinks } from './markdown/parse';
import { pagePaths } from './queries';
import { checkLink } from './link-refs';
import { SECTION_ROUTES } from './routes';
import type { Content } from './types';

export interface BrokenLink {
  /** File relative to the content root. */
  file: string;
  line: number;
  url: string;
  reason: string;
}

function markdownFiles(dir: string): string[] {
  return listEntries(dir).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDir) return e.name.startsWith('.') ? [] : markdownFiles(full);
    return e.name.endsWith('.md') ? [full] : [];
  });
}

/** Every broken internal link in the markdown files under `root`. */
export function findBrokenLinks(root: string, content: Content): BrokenLink[] {
  const pages = pagePaths(content, SECTION_ROUTES);
  const broken: BrokenLink[] = [];
  for (const full of markdownFiles(root)) {
    const raw = readText(full).replace(/^\uFEFF/, '');
    let body = raw;
    let offset = 0;
    try {
      body = matter(raw, {}).content;
      offset = raw.split('\n').length - body.split('\n').length;
    } catch {
      // Invalid front-matter is reported by validate; check the whole file.
    }
    for (const link of extractLinks(body)) {
      const reason = checkLink(link.url, pages);
      if (reason)
        broken.push({
          file: relative(root, full),
          line: link.line + offset,
          url: link.url,
          reason,
        });
    }
  }
  return broken;
}
