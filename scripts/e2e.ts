/**
 * pnpm e2e: builds and tests the site twice, first with the fixtures
 * (CONTENT_DIR=tests/fixtures/content), then with empty content: the real
 * _meta files and an empty folder per section and track, as the repository
 * started (/content itself gains notes from the admin). Pass "fixtures" or
 * "empty" to run one. Extra arguments after "--" go to Playwright.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SECTION_SLUGS } from '@/lib/schema/meta';

type Variant = { name: 'fixtures' | 'empty'; env: () => Record<string, string> };

const ARTIFACTS_ORIGIN = 'http://127.0.0.1:4401';
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const only = sep === -1 ? args : args.slice(0, sep);
const extra = sep === -1 ? [] : args.slice(sep + 1);

function run(command: string, env: Record<string, string>): boolean {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

/** A content folder with no notes: the real _meta files plus the .gitkeep skeleton. */
function emptyContent(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-content-'));
  fs.cpSync('content/_meta', path.join(dir, '_meta'), { recursive: true });
  const tracks = JSON.parse(fs.readFileSync('content/_meta/tracks.json', 'utf8')) as {
    slug: string;
  }[];
  for (const section of SECTION_SLUGS) {
    // Roadmaps and resources keep one file per track directly in the section folder.
    const folders =
      section === 'roadmaps' || section === 'resources'
        ? [section]
        : tracks.map((t) => path.join(section, t.slug));
    for (const folder of folders) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      fs.writeFileSync(path.join(dir, folder, '.gitkeep'), '');
    }
  }
  return dir;
}

const variants: Variant[] = [
  { name: 'fixtures', env: () => ({ CONTENT_DIR: 'tests/fixtures/content' }) },
  { name: 'empty', env: () => ({ CONTENT_DIR: emptyContent() }) },
];

let ok = true;
for (const v of variants.filter((x) => only.length === 0 || only.includes(x.name))) {
  const env = { ...v.env(), NEXT_PUBLIC_ARTIFACTS_ORIGIN: ARTIFACTS_ORIGIN };
  if (!run('pnpm build', env) || !run('pnpm build:artifacts', env)) {
    ok = false;
    break;
  }
  if (!run(`pnpm exec playwright test --project=${v.name} ${extra.join(' ')}`, env)) ok = false;
}
process.exit(ok ? 0 : 1);
