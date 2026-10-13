import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FILE = 'learning-notes/t/c/viz.html';

describe('versionedArtifactUrl', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-url-'));
    fs.mkdirSync(path.join(dir, 'learning-notes/t/c'), { recursive: true });
    fs.writeFileSync(path.join(dir, FILE), '<p>one</p>');
    vi.stubEnv('CONTENT_DIR', dir);
    vi.stubEnv('NEXT_PUBLIC_ARTIFACTS_ORIGIN', 'https://artifacts.example/');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds a version from the content, which changes when the file does', async () => {
    const { versionedArtifactUrl } = await import('@/lib/content/artifact-url');
    const first = versionedArtifactUrl(FILE);
    expect(first).toMatch(
      /^https:\/\/artifacts\.example\/learning-notes\/t\/c\/viz\.html\?v=[0-9a-f]{12}$/,
    );
    expect(versionedArtifactUrl(FILE)).toBe(first);
    fs.writeFileSync(path.join(dir, FILE), '<p>two</p>');
    expect(versionedArtifactUrl(FILE)).not.toBe(first);
  });

  it('is empty without an artifacts origin and plain when the file is missing', async () => {
    const { versionedArtifactUrl } = await import('@/lib/content/artifact-url');
    expect(versionedArtifactUrl('learning-notes/t/c/missing.html')).toBe(
      'https://artifacts.example/learning-notes/t/c/missing.html',
    );
    vi.stubEnv('NEXT_PUBLIC_ARTIFACTS_ORIGIN', '');
    vi.resetModules();
    const again = await import('@/lib/content/artifact-url');
    expect(again.versionedArtifactUrl(FILE)).toBe('');
  });
});
