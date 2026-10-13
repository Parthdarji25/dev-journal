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
import { addScriptPolicy, directive, headersFor, readHeaderRules, scopedHosts } from './headers';

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
const rules = readHeaderRules('vercel.json');
const csp = headersFor(rules, '/')['content-security-policy'] ?? '';
const framed = directive(csp, 'frame-src');
const fail = (message: string) => {
  console.error(`${message} HTML chapters will not load until vercel.json is fixed.`);
  process.exit(1);
};
if (process.env.VERCEL && origin) {
  const host = new URL(origin).host;
  if (!framed.includes(origin)) {
    fail(
      `vercel.json allows frames from ${framed.join(' ') || 'nowhere'}, but NEXT_PUBLIC_ARTIFACTS_ORIGIN is ${origin}. Put ${origin} in frame-src.`,
    );
  }
  // The artifacts project builds from this repository too, so it reads this
  // vercel.json: its host must get the sandbox headers, not the site's
  // frame-ancestors 'none'.
  if (!scopedHosts(rules).includes(host)) {
    fail(
      `vercel.json has no headers of their own for the artifacts host ${host}. Use ${host} in the "has" and "missing" host conditions.`,
    );
  }
}
