import { createRepoClient, type Snapshot } from '@/lib/github/client';
import type { RepoView } from '@/lib/admin/plan';
import { FakeGitHub, type FakeGitHubOptions } from '../../support/fake-github';

export const TOKEN = 'github_pat_test_token';

/** The empty content skeleton, as the real repository starts. */
export const SKELETON: Record<string, string> = {
  'content/_meta/tracks.json': '[]\n',
  'content/_meta/sections.json': '[]\n',
  'content/learning-notes/dsa-python/.gitkeep': '',
  'content/learning-notes/system-design/.gitkeep': '',
  'content/interview-questions/dsa-python/.gitkeep': '',
  'content/mind-maps/dsa-python/.gitkeep': '',
  'content/cheat-sheets/dsa-python/.gitkeep': '',
  'content/roadmaps/.gitkeep': '',
  'content/resources/.gitkeep': '',
  'README.md': '# repo\n',
};

export function setup(files: Record<string, string> = SKELETON, options: FakeGitHubOptions = {}) {
  const fake = new FakeGitHub({ files, token: TOKEN, ...options });
  const client = createRepoClient({
    owner: fake.owner,
    repo: fake.repo,
    branch: fake.branch,
    token: TOKEN,
    fetch: fake.fetch,
    sleep: async () => {},
  });
  return { fake, client };
}

/** The planners' view of the current branch head. */
export async function viewOf(client: ReturnType<typeof createRepoClient>): Promise<{
  snapshot: Snapshot;
  view: RepoView;
}> {
  const snapshot = await client.snapshot();
  return {
    snapshot,
    view: {
      files: snapshot.files,
      read: (path) => {
        const file = snapshot.files.get(path);
        if (!file) throw new Error(`${path} does not exist`);
        return client.readText(file.sha);
      },
    },
  };
}
