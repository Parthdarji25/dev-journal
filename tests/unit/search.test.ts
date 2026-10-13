import { describe, expect, it } from 'vitest';
import { cleanUrl, toSearchResults, type PagefindResultData } from '@/lib/search/pagefind';

const page = (over: Partial<PagefindResultData>): PagefindResultData => ({
  url: '/learning-notes/t/c/ch.html',
  excerpt: 'some <mark>text</mark>',
  meta: { title: 'Chapter' },
  filters: { section: ['learning-notes'], track: ['dsa-python'] },
  sub_results: [],
  ...over,
});

describe('cleanUrl', () => {
  it('drops .html and index.html but keeps hashes and queries', () => {
    expect(cleanUrl('/a/b.html')).toBe('/a/b');
    expect(cleanUrl('/a/index.html')).toBe('/a');
    expect(cleanUrl('/index.html')).toBe('/');
    expect(cleanUrl('/a/b.html#q1')).toBe('/a/b#q1');
    expect(cleanUrl('/a/b.html?x=1')).toBe('/a/b?x=1');
    expect(cleanUrl('/a/b')).toBe('/a/b');
  });
});

describe('toSearchResults', () => {
  it('maps a page to one result with its section and track', () => {
    expect(toSearchResults([page({})])).toEqual([
      {
        id: '/learning-notes/t/c/ch.html',
        url: '/learning-notes/t/c/ch',
        title: 'Chapter',
        excerpt: 'some <mark>text</mark>',
        section: 'learning-notes',
        track: 'dsa-python',
      },
    ]);
  });

  it('expands interview-question pages into one result per question heading', () => {
    const results = toSearchResults([
      page({
        url: '/interview-questions/t.html',
        filters: { section: ['interview-questions'], track: ['t'] },
        sub_results: [
          { title: 'Page', url: '/interview-questions/t.html', excerpt: 'page' },
          { title: 'What is X?', url: '/interview-questions/t.html#what-is-x', excerpt: 'x' },
          { title: 'What is Y?', url: '/interview-questions/t.html#what-is-y', excerpt: 'y' },
        ],
      }),
    ]);
    expect(results.map((r) => [r.title, r.url])).toEqual([
      ['What is X?', '/interview-questions/t#what-is-x'],
      ['What is Y?', '/interview-questions/t#what-is-y'],
    ]);
  });

  it('falls back to the URL when a page has no title, and tolerates missing filters', () => {
    expect(toSearchResults([page({ meta: {}, filters: {} })])[0]).toMatchObject({
      title: '/learning-notes/t/c/ch',
      section: undefined,
      track: undefined,
    });
  });
});
