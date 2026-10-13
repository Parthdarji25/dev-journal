import { describe, expect, it } from 'vitest';
import { loadContent, pagePaths, SECTION_ROUTES } from '@/lib/content';
import { checkLink, findLinksTo } from '@/lib/content/link-refs';
import { findBrokenLinks } from '@/lib/content/links';
import { FIXTURES, makeContent, md } from './helpers';

describe('checkLink', () => {
  const pages = new Set(['/', '/roadmap/dsa-python', '/learning-notes/dsa-python/arrays']);

  it('accepts existing pages with or without slash, query and hash', () => {
    for (const url of [
      '/',
      '/roadmap/dsa-python',
      '/roadmap/dsa-python/',
      '/learning-notes/dsa-python/arrays?x=1#top',
    ]) {
      expect(checkLink(url, pages)).toBeNull();
    }
  });

  it('ignores external, mailto, protocol-relative and same-page links', () => {
    for (const url of [
      'https://example.com/x',
      'mailto:a@b.c',
      '//cdn.example.com',
      '#section',
      '',
    ]) {
      expect(checkLink(url, pages)).toBeNull();
    }
  });

  it('flags missing pages and links to .md files', () => {
    expect(checkLink('/roadmap/unknown', pages)).toBe('no page at this address');
    expect(checkLink('../arrays/two-sum.md', pages)).toMatch(/not the \.md file/);
    expect(checkLink('two-sum.md#x', pages)).toMatch(/not the \.md file/);
  });
});

describe('findBrokenLinks', () => {
  it('finds no broken links in the fixtures', () => {
    expect(findBrokenLinks(FIXTURES, loadContent(FIXTURES))).toEqual([]);
  });

  it('reports file and line (counting front-matter) for each broken link', () => {
    const root = makeContent({
      'mind-maps/dsa-python/m.md': md(
        { title: 'M' },
        '# M\n\n- [ok](/tracks/dsa-python)\n- [bad](/mind-maps/dsa-python/nope)',
      ),
      'interview-questions/dsa-python/q.md': md(
        { question: 'Q', difficulty: 'easy' },
        'See [m](/mind-maps/dsa-python/m) and [file](m.md).',
      ),
    });
    expect(findBrokenLinks(root, loadContent(root))).toEqual([
      {
        file: 'interview-questions/dsa-python/q.md',
        line: 6,
        url: 'm.md',
        reason: expect.stringMatching(/\.md file/),
      },
      {
        file: 'mind-maps/dsa-python/m.md',
        line: 8,
        url: '/mind-maps/dsa-python/nope',
        reason: 'no page at this address',
      },
    ]);
  });

  it('knows every page the build emits for empty content', () => {
    const pages = pagePaths(loadContent(makeContent()), SECTION_ROUTES);
    expect(pages.has('/roadmap')).toBe(true);
    expect(pages.has('/interview-questions/system-design')).toBe(true);
    expect(pages.has('/tracks/gen-ai-engineer')).toBe(true);
    expect(pages.has('/roadmaps')).toBe(false);
    // Learning Notes pages are the index, courses and chapters, never a bare track.
    expect(pages.has('/learning-notes')).toBe(true);
    expect(pages.has('/learning-notes/gen-ai-engineer')).toBe(false);
  });
});

describe('findLinksTo', () => {
  it('lists the sources that link to a page (for rename/delete checks)', () => {
    const files = [
      { file: 'a.md', markdown: 'x\n\n[c](/learning-notes/t/c/ch/#h)' },
      { file: 'b.md', markdown: '[other](/learning-notes/t/c/other)' },
    ];
    expect(findLinksTo(files, '/learning-notes/t/c/ch')).toEqual([
      { file: 'a.md', line: 3, url: '/learning-notes/t/c/ch/#h' },
    ]);
  });
});
