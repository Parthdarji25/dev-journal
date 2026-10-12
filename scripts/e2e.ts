/**
 * pnpm e2e: builds and tests the site twice, first with the fixtures
 * (CONTENT_DIR=tests/fixtures/content), then with the real content, so out/
 * ends up holding the real build. Pass "fixtures" or "empty" to run one.
 * Extra arguments after "--" go to Playwright.
 */
import { spawnSync } from 'node:child_process';

type Variant = { name: 'fixtures' | 'empty'; env: Record<string, string> };

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

const variants: Variant[] = [
  { name: 'fixtures', env: { CONTENT_DIR: 'tests/fixtures/content' } },
  { name: 'empty', env: { CONTENT_DIR: '' } },
];

let ok = true;
for (const v of variants.filter((x) => only.length === 0 || only.includes(x.name))) {
  const env = { ...v.env, NEXT_PUBLIC_ARTIFACTS_ORIGIN: ARTIFACTS_ORIGIN };
  if (!run('pnpm build', env) || !run('pnpm build:artifacts', env)) {
    ok = false;
    break;
  }
  if (!run(`pnpm exec playwright test --project=${v.name} ${extra.join(' ')}`, env)) ok = false;
}
process.exit(ok ? 0 : 1);
