import { Octokit } from '@octokit/rest';
import { bytesToBase64, base64ToBytes, bytesToText, textToBytes } from './encoding';
import { GitHubError, toGitHubError } from './errors';
import { createGitHubFetch, type FetchLike } from './fetch';

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface TreeFile {
  path: string;
  sha: string;
  size: number;
}

/** The branch head and every file in it. */
export interface Snapshot {
  commitSha: string;
  treeSha: string;
  files: Map<string, TreeFile>;
}

/** One file of a commit: written from content, copied from an existing blob, or deleted. */
export type FileChange =
  | { path: string; action: 'write'; content: string | Uint8Array }
  | { path: string; action: 'copy'; sha: string }
  | { path: string; action: 'delete' };

export interface CommitRequest {
  message: string;
  changes: FileChange[];
  /**
   * For every touched path, the blob sha it was planned against (null: the
   * path must not exist). If GitHub's version differs, the commit is refused
   * as a conflict instead of overwriting newer work.
   */
  expect: Record<string, string | null>;
}

export interface CommitResult {
  commitSha: string;
  treeSha: string;
  /** Blob sha of each touched path before and after the commit (null: absent). */
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

export interface VerifyResult {
  canPush: boolean;
  /** ISO date-time the token expires, when GitHub says so. */
  expiresAt: string | null;
}

export interface ClientOptions extends RepoRef {
  token: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * "2026-12-31 00:00:00 UTC" or "2026-12-31 00:00:00 +0100" (the
 * github-authentication-token-expiration header) to an ISO string.
 */
export function parseTokenExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value
    .trim()
    .replace(' UTC', 'Z')
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2')
    .replace(/ ?([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type RepoClient = ReturnType<typeof createRepoClient>;

export function createRepoClient(options: ClientOptions) {
  const { owner, repo, branch } = options;
  const octokit = new Octokit({
    auth: options.token,
    userAgent: 'parth-notes-admin',
    request: { fetch: createGitHubFetch({ fetch: options.fetch, sleep: options.sleep }) },
  });
  const textCache = new Map<string, string>();

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toGitHubError(error);
    }
  }

  async function snapshot(): Promise<Snapshot> {
    return call(async () => {
      const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
      const commitSha = ref.data.object.sha;
      const commit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: commitSha });
      const treeSha = commit.data.tree.sha;
      const tree = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: 'true',
      });
      if (tree.data.truncated) {
        throw new GitHubError(
          'unknown',
          'The repository has too many files to list in one request',
        );
      }
      const files = new Map<string, TreeFile>();
      for (const entry of tree.data.tree) {
        if (entry.type === 'blob' && entry.path && entry.sha) {
          files.set(entry.path, { path: entry.path, sha: entry.sha, size: entry.size ?? 0 });
        }
      }
      return { commitSha, treeSha, files };
    });
  }

  async function readBlob(sha: string): Promise<Uint8Array> {
    return call(async () => {
      const blob = await octokit.rest.git.getBlob({ owner, repo, file_sha: sha });
      return blob.data.encoding === 'base64'
        ? base64ToBytes(blob.data.content)
        : textToBytes(blob.data.content);
    });
  }

  async function readText(sha: string): Promise<string> {
    const cached = textCache.get(sha);
    if (cached !== undefined) return cached;
    const text = bytesToText(await readBlob(sha));
    textCache.set(sha, text);
    return text;
  }

  return {
    owner,
    repo,
    branch,

    /** Checks the token can push to the repository and that the branch exists. */
    async verify(): Promise<VerifyResult> {
      return call(async () => {
        const response = await octokit.rest.repos.get({ owner, repo });
        await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
        const headers = response.headers as Record<string, string | undefined>;
        return {
          canPush: Boolean(response.data.permissions?.push),
          expiresAt: parseTokenExpiry(headers['github-authentication-token-expiration']),
        };
      });
    },

    snapshot,
    readBlob,
    readText,

    /**
     * Writes every change as ONE commit through the Git Data API: fresh ref,
     * base tree, blobs, a new tree (deletions as sha null), the commit, then a
     * non-forced ref update. A moved ref or a changed file is a conflict.
     */
    async commit(request: CommitRequest): Promise<CommitResult> {
      const base = await snapshot();
      const touched = [
        ...new Set([...Object.keys(request.expect), ...request.changes.map((c) => c.path)]),
      ];
      const before = Object.fromEntries(touched.map((p) => [p, base.files.get(p)?.sha ?? null]));

      const changed = Object.entries(request.expect)
        .filter(([path, sha]) => before[path] !== sha)
        .map(([path]) => path);
      if (changed.length > 0) {
        throw new GitHubError('conflict', 'Files changed on GitHub since they were opened', {
          reason: 'changed',
          paths: changed,
        });
      }

      return call(async () => {
        const after: Record<string, string | null> = { ...before };
        const tree: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = [];
        for (const change of request.changes) {
          if (change.action === 'delete') {
            tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
            after[change.path] = null;
            continue;
          }
          let sha: string;
          if (change.action === 'copy') {
            sha = change.sha;
          } else {
            const bytes =
              typeof change.content === 'string' ? textToBytes(change.content) : change.content;
            const blob = await octokit.rest.git.createBlob({
              owner,
              repo,
              content: bytesToBase64(bytes),
              encoding: 'base64',
            });
            sha = blob.data.sha;
          }
          tree.push({ path: change.path, mode: '100644', type: 'blob', sha });
          after[change.path] = sha;
        }

        const newTree = await octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: base.treeSha,
          tree,
        });
        const commit = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: request.message,
          tree: newTree.data.sha,
          parents: [base.commitSha],
        });
        try {
          await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            sha: commit.data.sha,
            force: false,
          });
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 409 || status === 422) {
            throw new GitHubError('conflict', `Someone else pushed to ${branch} while saving`, {
              status,
              reason: 'moved',
            });
          }
          throw error;
        }
        return { commitSha: commit.data.sha, treeSha: newTree.data.sha, before, after };
      });
    },
  };
}
