import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/content/markdown/render';
import { shikiCss, themeColours } from '@/lib/content/markdown/shiki';
import { REPO_ROOT } from './helpers';

const cssFile = path.join(REPO_ROOT, 'src/styles/shiki.css');

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('shiki.css', () => {
  it('is up to date (run pnpm gen:shiki-css after changing themes)', async () => {
    expect(fs.readFileSync(cssFile, 'utf8').replace(/\r\n/g, '\n')).toBe(await shikiCss());
  });

  it('has a rule for every class the highlighter emits', async () => {
    const css = fs.readFileSync(cssFile, 'utf8');
    const { html } = await renderMarkdown(
      [
        '```python\n@decorator\ndef f(x: int) -> str:\n    """doc"""\n    return f"{x!r}"  # c\n```',
        '```ts\nconst a: Record<string, number> = { b: 1 } as const;\n```',
        '```css\n.a:hover { color: #fff !important; }\n```',
        '```bash\necho "$HOME" | grep -i x\n```',
      ].join('\n\n'),
    );
    const classes = new Set(html.match(/\bs[ld]-[0-9a-z]+\b/g));
    expect(classes.size).toBeGreaterThan(4);
    for (const cls of classes) expect(css).toContain(`.${cls} `);
  });

  // Code blocks sit on the surface token: #FFFFFF in light mode, #171A21 in dark mode.
  it.each([
    ['light', '#ffffff'],
    ['dark', '#171a21'],
  ] as const)(
    'every %s token colour meets WCAG AA (4.5:1) on the code background',
    async (mode, bg) => {
      const failing = (await themeColours(mode))
        .filter((c) => /^#[0-9a-f]{6}$/.test(c))
        .map((c) => [c, Number(contrast(c, bg).toFixed(2))] as const)
        .filter(([, ratio]) => ratio < 4.5);
      expect(failing).toEqual([]);
    },
  );
});
