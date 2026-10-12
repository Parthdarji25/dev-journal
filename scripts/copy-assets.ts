/**
 * Copies every content/** /assets/* image to public/content/ with the same
 * path, so markdown images resolve at /content/<folder>/assets/<file>.
 * public/content is generated (gitignored) and rebuilt from scratch each run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentDir } from '@/lib/content/fs';

const root = contentDir();
const out = path.resolve('public/content');

fs.rmSync(out, { recursive: true, force: true });

let copied = 0;
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'assets') {
      for (const file of fs.readdirSync(full, { withFileTypes: true })) {
        if (!file.isFile() || file.name.startsWith('.')) continue;
        const target = path.join(out, path.relative(root, full), file.name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(full, file.name), target);
        copied++;
      }
    } else if (!entry.name.startsWith('.') && !entry.name.startsWith('_')) {
      walk(full);
    }
  }
}

if (fs.existsSync(root)) walk(root);
console.log(`Copied ${copied} content image(s) to public/content.`);
