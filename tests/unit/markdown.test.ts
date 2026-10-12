import { describe, expect, it } from 'vitest';
import { readingMinutes, renderMarkdown } from '@/lib/content/markdown/render';
import {
  parseComplexity,
  renderCaseStudy,
  renderProblem,
  splitH2Sections,
} from '@/lib/content/markdown/sections';
import { styleToClasses } from '@/lib/content/markdown/shiki';

describe('renderMarkdown', () => {
  it('adds ids and anchor links to headings and collects h2/h3 for the TOC', async () => {
    const { html, headings } = await renderMarkdown(
      '## First part\n\n### Detail\n\n#### Deep\n\n## First part',
    );
    expect(html).toContain('<h2 id="first-part">');
    expect(html).toContain('href="#first-part"');
    expect(html).toContain('aria-label="Link to this section"');
    expect(headings).toEqual([
      { depth: 2, id: 'first-part', text: 'First part' },
      { depth: 3, id: 'detail', text: 'Detail' },
      { depth: 2, id: 'first-part-1', text: 'First part' },
    ]);
  });

  it('never renders raw HTML, scripts or event handlers', async () => {
    const { html } = await renderMarkdown(
      'Hi <script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n[x](javascript:alert(1))',
    );
    expect(html).not.toMatch(/<script|onerror|<iframe|javascript:/i);
    expect(html).toContain('Hi');
  });

  it('renders GFM tables, task lists and strikethrough', async () => {
    const { html } = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n~~old~~');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<del>old</del>');
  });

  it('turns [!TIP], [!NOTE] and [!WARNING] blockquotes into callouts', async () => {
    const { html } = await renderMarkdown(
      '> [!TIP]\n> Use gap.\n\n> [!note] Inline body\n\n> [!WARNING]\n\n> Plain quote',
    );
    expect(html).toContain(
      '<div class="callout callout-tip" role="note"><p class="callout-title">Tip</p>',
    );
    expect(html).toContain('Use gap.');
    expect(html).toContain('callout-note');
    expect(html).toContain('Inline body');
    expect(html).toContain('callout-warning');
    expect(html).not.toContain('[!');
    expect(html).toContain('<blockquote>');
  });

  it('highlights code at build time with classes, not inline styles', async () => {
    const { html } = await renderMarkdown('```python\ndef f(x):\n    return x  # note\n```');
    expect(html).toContain('<pre class="shiki" data-language="python" tabindex="0">');
    expect(html).toMatch(/class="sl-[0-9a-f]+ sd-[0-9a-f]+"/);
    expect(html).not.toContain('style=');
  });

  it('leaves unknown languages as plain escaped code', async () => {
    const { html } = await renderMarkdown('```nosuchlang\n<b>x</b>\n```\n\n```\nplain\n```');
    expect(html).toContain('data-language="nosuchlang"');
    expect(html).toContain('&#x3C;b>x&#x3C;/b>');
    expect(html).toContain('data-language="text"');
  });

  it('sizes, resolves and lazy-loads images; the first can load eagerly', async () => {
    const { html } = await renderMarkdown(
      '![A](assets/a.webp "800x600")\n\n![B](https://cdn.example.com/b.png)\n\n![C](/abs.png "a caption")',
      { resolveAsset: (src) => `/content-assets/course/${src}`, eagerFirstImage: true },
    );
    expect(html).toContain(
      '<img src="/content-assets/course/assets/a.webp" alt="A" width="800" height="600" loading="eager" decoding="auto">',
    );
    expect(html).toContain(
      '<img src="https://cdn.example.com/b.png" alt="B" loading="lazy" decoding="async">',
    );
    expect(html).toContain('src="/abs.png" alt="C" title="a caption" loading="lazy"');
  });

  it('handles an empty document', async () => {
    expect(await renderMarkdown('')).toEqual({ html: '', headings: [] });
  });
});

describe('styleToClasses', () => {
  it('maps Shiki style variables to classes', () => {
    expect(
      styleToClasses('--shiki-light:#D73A49;--shiki-dark:#F97583;--shiki-light-font-style:italic'),
    ).toEqual(['sl-d73a49', 'sd-f97583', 'sl-i']);
    expect(styleToClasses('color:red')).toEqual([]);
  });
});

describe('readingMinutes', () => {
  it('is at least one minute and grows with length', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
  });
});

describe('splitH2Sections', () => {
  it('splits at ## headings but not inside fenced code', () => {
    const md =
      'intro\n\n## One\n\nbody 1\n\n```md\n## not a heading\n```\n\n## Two ##\n\nbody 2\n\n### sub';
    const { intro, sections } = splitH2Sections(md);
    expect(intro).toBe('intro');
    expect(sections.map((s) => s.title)).toEqual(['One', 'Two']);
    expect(sections[0]?.body).toContain('## not a heading');
    expect(sections[1]?.body).toContain('### sub');
  });

  it('handles tilde fences and documents without sections', () => {
    expect(splitH2Sections('~~~\n## x\n~~~').sections).toEqual([]);
    expect(splitH2Sections('')).toEqual({ intro: '', sections: [] });
  });
});

describe('problem chapters', () => {
  const md = [
    '## Problem',
    'Find two numbers.',
    '## Approach',
    'Use a map.',
    '## Solution',
    '```python\nprint(1)\n```',
    '## Complexity',
    '- **Time:** `O(n)`',
    '- Space: O(1)',
    '## Follow-up',
    'Sorted input?',
  ].join('\n\n');

  it('splits the four named sections and keeps others', async () => {
    const p = await renderProblem(md);
    expect(p.problem?.html).toContain('Find two numbers.');
    expect(p.approach?.html).toContain('Use a map.');
    expect(p.solution?.html).toContain('class="shiki"');
    expect(p.complexity).toMatchObject({ time: 'O(n)', space: 'O(1)' });
    expect(p.other.map((s) => s.title)).toEqual(['Follow-up']);
    expect(p.intro).toBeNull();
  });

  it('tolerates missing sections (partial data)', async () => {
    const p = await renderProblem('## Problem\n\nOnly the statement.');
    expect(p.problem).not.toBeNull();
    expect(p.approach).toBeNull();
    expect(p.solution).toBeNull();
    expect(p.complexity).toBeNull();
  });

  it('parseComplexity reads plain and decorated lines', () => {
    expect(parseComplexity('Time: O(n log n)\nSpace: O(n)')).toEqual({
      time: 'O(n log n)',
      space: 'O(n)',
    });
    expect(parseComplexity('nothing here')).toEqual({});
  });
});

describe('case-study chapters', () => {
  it('makes one step per H2 with unique ids', async () => {
    const c = await renderCaseStudy('Intro text\n\n## Scale\n\nA\n\n## Scale\n\nB\n\n## 日本\n\nC');
    expect(c.intro?.html).toContain('Intro text');
    expect(c.steps.map((s) => s.id)).toEqual(['scale', 'scale-2', 'section-3']);
    expect(c.steps[1]?.html).toContain('B');
  });

  it('renders a case study with no steps', async () => {
    expect(await renderCaseStudy('')).toEqual({ intro: null, steps: [] });
  });
});
