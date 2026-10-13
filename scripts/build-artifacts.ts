/**
 * pnpm build:artifacts: builds the artifacts-only site for the second Vercel
 * project. Every content/** /*.html is copied to artifacts-out/ with the same
 * path, with a small script injected that reports the document height to the
 * embedding page (the main site's ArtifactFrame) via postMessage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { injectResizeScript } from '@/lib/artifacts';
import { contentDir } from '@/lib/content/fs';

const root = contentDir();
const out = path.resolve('artifacts-out');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') ? [] : walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = fs.existsSync(root) ? walk(root) : [];
for (const file of files) {
  const target = path.join(out, path.relative(root, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, injectResizeScript(fs.readFileSync(file, 'utf8')));
}

// Its own vercel.json (headers only), so artifacts-out/ also deploys as a plain static folder.
const config = path.resolve('artifacts-site/vercel.json');
if (fs.existsSync(config)) {
  const { $schema, headers } = JSON.parse(fs.readFileSync(config, 'utf8')) as {
    $schema?: string;
    headers?: unknown[];
  };
  fs.writeFileSync(
    path.join(out, 'vercel.json'),
    `${JSON.stringify({ $schema, headers: headers ?? [] }, null, 2)}\n`,
  );
}
// A root page so the artifacts origin has something at "/".
fs.writeFileSync(
  path.join(out, 'index.html'),
  '<!doctype html><title>Artifacts</title><p>Artifacts only.</p>\n',
);

console.log(`Built ${files.length} artifact(s) into artifacts-out/.`);
