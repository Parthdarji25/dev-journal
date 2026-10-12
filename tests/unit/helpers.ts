import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURES = path.join(REPO_ROOT, 'tests/fixtures/content');
export const REAL_CONTENT = path.join(REPO_ROOT, 'content');

const TRACKS = [
  'frontend-development',
  'backend-development',
  'gen-ai-engineer',
  'dsa-python',
  'system-design',
];

/**
 * A throwaway content root: the real _meta files, the empty folder skeleton
 * (unless `skeleton` is false) and the given files ("path": "contents").
 */
export function makeContent(files: Record<string, string> = {}, skeleton = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
  fs.mkdirSync(path.join(root, '_meta'));
  for (const f of ['tracks.json', 'sections.json']) {
    fs.copyFileSync(path.join(REAL_CONTENT, '_meta', f), path.join(root, '_meta', f));
  }
  if (skeleton) {
    for (const section of ['learning-notes', 'mind-maps', 'interview-questions', 'cheat-sheets']) {
      for (const t of TRACKS) {
        fs.mkdirSync(path.join(root, section, t), { recursive: true });
        fs.writeFileSync(path.join(root, section, t, '.gitkeep'), '');
      }
    }
    for (const section of ['roadmaps', 'resources']) {
      fs.mkdirSync(path.join(root, section), { recursive: true });
      fs.writeFileSync(path.join(root, section, '.gitkeep'), '');
    }
  }
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}

export function md(frontmatter: Record<string, unknown>, body = ''): string {
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}\n`;
}
