/** Regenerates src/styles/shiki.css, the classes that replace Shiki's inline colours. */
import fs from 'node:fs';
import path from 'node:path';
import { shikiCss } from '@/lib/content/markdown/shiki';

const out = path.resolve('src/styles/shiki.css');
fs.writeFileSync(out, await shikiCss());
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
