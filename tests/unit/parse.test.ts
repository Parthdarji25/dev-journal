import { describe, expect, it } from 'vitest';
import {
  extractLinks,
  parseCheatSheet,
  parseMindMap,
  parseResources,
  parseRoadmapSteps,
} from '@/lib/content/markdown/parse';

describe('parseRoadmapSteps', () => {
  it('reads bold titles, descriptions and optional notes links', () => {
    const steps = parseRoadmapSteps(
      '1. **HTML** - Structure of a page.\n2. **CSS** - Styling. [Notes](/learning-notes/frontend-development/css)\n3. **JS**',
    );
    expect(steps).toEqual([
      { title: 'HTML', description: 'Structure of a page.' },
      {
        title: 'CSS',
        description: 'Styling.',
        link: { href: '/learning-notes/frontend-development/css', label: 'Notes' },
      },
      { title: 'JS', description: '' },
    ]);
  });

  it('falls back to "Title - description" without bold', () => {
    expect(parseRoadmapSteps('1. Basics - The first step')).toEqual([
      { title: 'Basics', description: 'The first step' },
    ]);
  });

  it('returns no steps for an empty roadmap (partial data)', () => {
    expect(parseRoadmapSteps('')).toEqual([]);
    expect(parseRoadmapSteps('Just a paragraph, no list.')).toEqual([]);
  });
});

describe('parseMindMap', () => {
  it('builds root, branches and nested leaves', () => {
    const root = parseMindMap(
      '# HTTP\n\n## Methods\n\n- GET\n- POST\n  - Creates\n\n## Codes\n\n- 2xx',
      'Fallback',
    );
    expect(root).toEqual({
      title: 'HTTP',
      children: [
        {
          title: 'Methods',
          children: [
            { title: 'GET', children: [] },
            { title: 'POST', children: [{ title: 'Creates', children: [] }] },
          ],
        },
        { title: 'Codes', children: [{ title: '2xx', children: [] }] },
      ],
    });
  });

  it('nests H3 under the current branch and uses the fallback title without H1', () => {
    const root = parseMindMap('## A\n\n### A1\n\n- leaf\n\n## B', 'Map');
    expect(root.title).toBe('Map');
    expect(root.children[0]?.children[0]).toEqual({
      title: 'A1',
      children: [{ title: 'leaf', children: [] }],
    });
    expect(root.children[1]).toEqual({ title: 'B', children: [] });
  });

  it('handles an empty map', () => {
    expect(parseMindMap('', 'Empty')).toEqual({ title: 'Empty', children: [] });
  });
});

describe('parseCheatSheet', () => {
  it('reads groups and rows, keeping escaped pipes in code', () => {
    const groups = parseCheatSheet(
      '## Create\n\n| Code | What it does |\n| --- | --- |\n| `xs = []` | Empty list |\n| `a \\| b` | Pipe |\n\n## Empty',
    );
    expect(groups).toEqual([
      {
        title: 'Create',
        rows: [
          { code: 'xs = []', description: 'Empty list' },
          { code: 'a | b', description: 'Pipe' },
        ],
      },
      { title: 'Empty', rows: [] },
    ]);
  });

  it('puts a table before any heading in an untitled group', () => {
    expect(parseCheatSheet('| Code | What |\n| - | - |\n| `x` | y |')).toEqual([
      { title: '', rows: [{ code: 'x', description: 'y' }] },
    ]);
  });

  it('returns no groups for an empty sheet', () => {
    expect(parseCheatSheet('')).toEqual([]);
  });
});

describe('parseResources', () => {
  it('reads title, url, type, note and domain', () => {
    const { links, problems } = parseResources(
      '- [MDN](https://www.mozilla.org/docs) - type: docs - The reference\n- [Talk](https://v.example.com/x) - type: Video',
    );
    expect(problems).toEqual([]);
    expect(links).toEqual([
      {
        title: 'MDN',
        url: 'https://www.mozilla.org/docs',
        type: 'docs',
        note: 'The reference',
        domain: 'mozilla.org',
      },
      {
        title: 'Talk',
        url: 'https://v.example.com/x',
        type: 'video',
        note: '',
        domain: 'v.example.com',
      },
    ]);
  });

  it('reports lines without a link, without a type, or with a bad type or URL', () => {
    const { links, problems } = parseResources(
      [
        '- Just text',
        '- [No type](https://a.example.com)',
        '- [Bad type](https://a.example.com) - type: podcast',
        '- [Bad url](ftp://a.example.com) - type: docs',
      ].join('\n'),
    );
    expect(links).toEqual([]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toMatch(/^line 1: .*\[Title\]\(url\)/);
    expect(problems[1]).toMatch(/^line 2: type is required/);
  });
});

describe('extractLinks', () => {
  it('finds inline links and reference definitions with line numbers, not images', () => {
    const links = extractLinks(
      'Intro [a](/x)\n\n![img](/y.png)\n\n[ref][r]\n\n[r]: https://example.com',
    );
    expect(links).toEqual([
      { url: '/x', line: 1 },
      { url: 'https://example.com', line: 7 },
    ]);
  });
});
