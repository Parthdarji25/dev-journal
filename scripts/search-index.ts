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

const written = await index.writeFiles({ outputPath: path.join(site, 'pagefind') });
if (written.errors.length) {
  throw new Error(`Pagefind could not write the index: ${written.errors.join('; ')}`);
}

console.log(
  `Search index: ${pages} page(s) indexed into ${path.relative(process.cwd(), site)}/pagefind.`,
);
await close();
