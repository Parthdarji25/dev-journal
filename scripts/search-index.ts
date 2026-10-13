/**
 * Builds the Pagefind search index for out/ (run by pnpm build).
 *
 * Only pages with a data-pagefind-body region are indexed. They are added one
 * by one through Pagefind's Node API because:
 * - the CLI refuses to write an index when nothing is indexable, which is
 *   the normal state of a site with no content yet;
 * - given a whole directory with no data-pagefind-body anywhere, Pagefind
 *   falls back to indexing every page ("Coming soon" placeholders included).
 */
import fs from 'node:fs';
import path from 'node:path';
import { close, createIndex } from 'pagefind';

const site = path.resolve(process.argv[2] ?? 'out');

function htmlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '_next' || e.name === 'pagefind' ? [] : htmlFiles(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

const { index, errors } = await createIndex({});
if (!index) throw new Error(`Pagefind could not start: ${errors.join('; ')}`);

let pages = 0;
for (const file of htmlFiles(site)) {
  const content = fs.readFileSync(file, 'utf8');
  if (!/data-pagefind-body(?=[\s>=])/.test(content)) continue;
  const url = '/' + path.relative(site, file).split(path.sep).join('/');
  const added = await index.addHTMLFile({ url, content });
  if (added.errors.length)
    throw new Error(`Pagefind could not index ${url}: ${added.errors.join('; ')}`);
  pages++;
}

const output = path.join(site, 'pagefind');
const written = await index.writeFiles({ outputPath: output });
if (written.errors.length) {
  throw new Error(`Pagefind could not write the index: ${written.errors.join('; ')}`);
}
// writeFiles can resolve while the backend is still flushing files, and close()
// kills the backend: on a busy machine that left empty files and broke search.
await waitForFiles(output);
await close();
JSON.parse(fs.readFileSync(path.join(output, 'pagefind-entry.json'), 'utf8'));

console.log(
  `Search index: ${pages} page(s) indexed into ${path.relative(process.cwd(), site)}/pagefind.`,
);

/** Every file under `dir` with its size. */
function fileSizes(dir: string): [string, number][] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? fileSizes(full) : [[full, fs.statSync(full).size] as [string, number]];
  });
}

/** Waits until no file is empty and the sizes hold still. */
async function waitForFiles(dir: string, timeoutMs = 30_000) {
  let previous = '';
  for (const start = Date.now(); Date.now() - start < timeoutMs;) {
    const sizes = fileSizes(dir);
    const snapshot = JSON.stringify(sizes);
    if (sizes.length > 0 && sizes.every(([, size]) => size > 0) && snapshot === previous) return;
    previous = snapshot;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Pagefind did not finish writing ${dir}`);
}
