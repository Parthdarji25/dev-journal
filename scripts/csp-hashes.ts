/**
 * Build step after `next build`: gives every exported page its own script
 * policy (see addScriptPolicy), so only that page's inline scripts run. These
 * are hashes instead of 'unsafe-inline'; a single vercel.json header cannot
 * list them because each page carries its own Next.js data script.
 *
 * On Vercel it also checks that vercel.json lets the artifacts origin be
 * framed, so HTML chapters never ship broken.
 */
import fs from 'node:fs';
import path from 'node:path';
import { addScriptPolicy, directive, headersFor, readHeaderRules } from './headers';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

const pages = walk(path.resolve('out'));
for (const file of pages) fs.writeFileSync(file, addScriptPolicy(fs.readFileSync(file, 'utf8')));
console.log(`Added script hashes to ${pages.length} page(s).`);

const origin = (process.env.NEXT_PUBLIC_ARTIFACTS_ORIGIN ?? '').replace(/\/+$/, '');
const csp = headersFor(readHeaderRules('vercel.json'), '/')['content-security-policy'] ?? '';
const framed = directive(csp, 'frame-src');
if (process.env.VERCEL && origin && !framed.includes(origin)) {
  console.error(
    `vercel.json allows frames from ${framed.join(' ') || 'nowhere'}, but NEXT_PUBLIC_ARTIFACTS_ORIGIN is ${origin}. ` +
      `Put ${origin} in frame-src in vercel.json, or HTML chapters will not load.`,
  );
  process.exit(1);
}
