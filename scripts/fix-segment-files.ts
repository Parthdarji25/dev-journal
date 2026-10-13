/**
 * Works around a Next.js 16 static-export bug on Windows. The client router
 * prefetches segment data from dotted file names such as
 * `tracks/x/__next.tracks.$d$track.__PAGE__.txt`, but on Windows the export
 * collects segment paths with backslashes, so it writes nested folders
 * (`__next.tracks/$d$track/__PAGE__.txt`) instead. Those prefetches then 404.
 *
 * This flattens any `__next.*` folder in out/ back into dotted file names. On
 * Linux and macOS (Vercel, CI) there are no such folders and it does nothing.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] ?? 'out');

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(full) : [full];
  });
}

let fixed = 0;
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('__next.')) {
      for (const file of filesUnder(full)) {
        const dotted = [entry.name, ...path.relative(full, file).split(path.sep)].join('.');
        fs.renameSync(file, path.join(dir, dotted));
        fixed++;
      }
      fs.rmSync(full, { recursive: true, force: true });
    } else if (entry.name !== '_next' && entry.name !== 'pagefind') {
      walk(full);
    }
  }
}

if (fs.existsSync(OUT)) walk(OUT);
if (fixed)
  console.log(`Flattened ${fixed} segment file(s) into dotted names (Next.js export on Windows).`);
