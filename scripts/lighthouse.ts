/**
 * pnpm lighthouse: audits home, one chapter and the interview questions page
 * of the built site in out/ (build it with CONTENT_DIR=tests/fixtures/content)
 * with Lighthouse's default mobile settings, and prints the scores.
 *
 * Fails only if Accessibility, Best Practices or SEO is below 90. Performance
 * and LCP are printed for information and never fail the run.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { close, createStaticServer, listen } from './static-server';

const PORT = 4400;
const PAGES = [
  '/',
  '/learning-notes/frontend-development/css-layout/flexbox-basics',
  '/interview-questions/gen-ai-engineer',
];
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
const ENFORCED = ['accessibility', 'best-practices', 'seo'] as const;
const MIN_SCORE = 90;

interface Report {
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number }>;
}

/** Async on purpose: the static servers below run in this same process. */
function lighthouse(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    // chrome-launcher closes Chrome with taskkill on Windows; some shells (Git Bash) leave it off PATH.
    const env =
      process.platform === 'win32'
        ? {
            ...process.env,
            PATH: `${process.env.PATH}${path.delimiter}${path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32')}`,
          }
        : process.env;
    spawn('pnpm', ['exec', 'lighthouse', ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env,
    }).on('close', () => resolve());
  });
}

const site = createStaticServer('out');
const artifacts = createStaticServer('artifacts-out');
await listen(site, PORT);
await listen(artifacts, PORT + 1);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-'));
let failed = false;

try {
  for (const page of PAGES) {
    const out = path.join(dir, `${page === '/' ? 'home' : page.replace(/\W+/g, '_')}.json`);
    await lighthouse([
      `http://127.0.0.1:${PORT}${page}`,
      '--quiet',
      '--output=json',
      `--output-path=${out}`,
      `--only-categories=${CATEGORIES.join(',')}`,
      // Quoted on Windows, where the command runs through a shell that would split it.
      process.platform === 'win32'
        ? '"--chrome-flags=--headless=new"'
        : '--chrome-flags=--headless=new',
    ]);
    // Judged by the report, not the exit code, which is also non-zero when closing Chrome fails.
    if (!fs.existsSync(out)) {
      console.error(`FAIL  ${page}: Lighthouse did not produce a report`);
      failed = true;
      continue;
    }
    const report = JSON.parse(fs.readFileSync(out, 'utf8')) as Report;
    const score = (c: string) => Math.round((report.categories[c]?.score ?? 0) * 100);
    const lcp = report.audits['largest-contentful-paint']?.numericValue ?? 0;
    const ok = ENFORCED.every((c) => score(c) >= MIN_SCORE);
    if (!ok) failed = true;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${page}\n      ` +
        `${CATEGORIES.map((c) => `${c} ${score(c)}`).join(' · ')} · LCP ${(lcp / 1000).toFixed(1)}s`,
    );
  }
} finally {
  await Promise.all([close(site), close(artifacts)]);
}

console.log(
  `\nFails below ${MIN_SCORE} in accessibility, best-practices or seo. Performance and LCP are for information only.`,
);
process.exit(failed ? 1 : 0);
