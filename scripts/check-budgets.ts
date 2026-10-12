/**
 * pnpm check-budgets: per public page in out/, the gzipped size of the
 * JavaScript the HTML loads up front (lazy chunks are excluded because they
 * are not referenced by the HTML) and the raw HTML size.
 *
 * The JS column is split into "framework" (Next.js rootMainFiles from
 * .next/build-manifest.json: React DOM, the router and runtime, identical on
 * every page) and "app" (everything else, i.e. our code). The 100 KB budget
 * applies to app JS: the framework alone is ~130 KB, so a total cap of 100 KB
 * cannot be met with the App Router (decision recorded in Phase 3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const OUT = path.resolve(process.argv[2] ?? 'out');
const APP_JS_BUDGET = 100 * 1024;
const HTML_BUDGET = 150 * 1024;

function htmlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '_next' || e.name === 'pagefind' ? [] : htmlFiles(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

function frameworkFiles(): Set<string> {
  try {
    const manifest = JSON.parse(fs.readFileSync('.next/build-manifest.json', 'utf8')) as {
      rootMainFiles?: string[];
    };
    return new Set((manifest.rootMainFiles ?? []).map((f) => `/_next/${f}`));
  } catch {
    return new Set();
  }
}

const gzCache = new Map<string, number>();
function gzSize(file: string): number {
  let size = gzCache.get(file);
  if (size === undefined) {
    size = gzipSync(fs.readFileSync(file), { level: 9 }).length;
    gzCache.set(file, size);
  }
  return size;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

if (!fs.existsSync(OUT)) {
  console.error(`${OUT} does not exist. Run pnpm build first.`);
  process.exit(1);
}

const framework = frameworkFiles();
if (framework.size === 0) {
  console.error('No framework chunks found in .next/build-manifest.json. Run pnpm build first.');
  process.exit(1);
}
let failed = false;
const rows: { page: string; js: number; fw: number; html: number }[] = [];
for (const file of htmlFiles(OUT)) {
  const page = '/' + path.relative(OUT, file).split(path.sep).join('/');
  if (page.startsWith('/admin')) continue;
  const html = fs.readFileSync(file, 'utf8');
  // noModule scripts are legacy polyfills that modern browsers never download.
  const srcs = new Set(
    [...html.matchAll(/<script\b(?![^>]*\bnomodule)[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1] ?? ''),
  );
  let js = 0;
  let fw = 0;
  for (const src of srcs) {
    if (!src.startsWith('/')) continue;
    const clean = decodeURIComponent(src.split('?')[0] ?? '');
    const local = path.join(OUT, clean);
    if (!fs.existsSync(local)) continue;
    const size = gzSize(local);
    js += size;
    if (framework.has(clean)) fw += size;
  }
  const htmlSize = Buffer.byteLength(html);
  rows.push({ page, js, fw, html: htmlSize });
  if (js - fw > APP_JS_BUDGET || htmlSize > HTML_BUDGET) failed = true;
}

rows.sort((a, b) => b.js - a.js);
console.log(
  `${'total js'.padStart(9)} ${'framework'.padStart(10)} ${'app js'.padStart(9)} ${'html'.padStart(9)}  page`,
);
for (const r of rows) {
  const flag = r.js - r.fw > APP_JS_BUDGET || r.html > HTML_BUDGET ? '  OVER BUDGET' : '';
  console.log(
    `${kb(r.js).padStart(9)} ${kb(r.fw).padStart(10)} ${kb(r.js - r.fw).padStart(9)} ${kb(r.html).padStart(9)}  ${r.page}${flag}`,
  );
}
console.log(
  `\n${rows.length} pages. Budgets: ${kb(APP_JS_BUDGET)} gzipped app JS, ${kb(HTML_BUDGET)} HTML.`,
);
if (failed) {
  console.error('Some pages are over budget.');
  process.exit(1);
}
