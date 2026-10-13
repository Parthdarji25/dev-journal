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
  /** The branch exactly as this commit left it, so the admin can update without re-reading GitHub. */
  snapshot: Snapshot;
  message: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  /** ISO date-time. */
  date: string;
}

export interface CommitPage {
  commits: CommitSummary[];
  hasMore: boolean;
}

export type FileStatus =
  'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';

export interface CommitFile {
  path: string;
  status: FileStatus;
  /** Path before a rename. */
  previousPath?: string;
  /** Blob sha after the commit (null when removed). */
  sha: string | null;
}

export interface CommitDetail extends CommitSummary {
  parents: string[];
  files: CommitFile[];
}

/** What the deploy of a commit is doing, from its statuses, deployments and check runs. */
export type SiteState = 'building' | 'live' | 'failed' | 'unknown';

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
  const detailCache = new Map<string, CommitDetail>();
  const treeCache = new Map<string, Map<string, TreeFile>>();
  /** Sizes of blobs seen in any tree or written, so copied (restored) files keep their size. */
  const blobSizes = new Map<string, number>();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  /** Heads this client moved the branch from and to, and the newest one it pushed. */
  const ownHeads = new Set<string>();
  let latestPushed: string | null = null;

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toGitHubError(error);
    }
  }

  /**
   * The branch head. Right after a push GitHub can still answer with the old
   * head for a moment; a head this client has already moved past is stale,
   * so it asks again and, if GitHub still lags, uses the head it pushed.
   */
  async function headSha(): Promise<string> {
    const read = async () =>
      (await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` })).data.object.sha;
    const stale = (sha: string) =>
      latestPushed !== null && sha !== latestPushed && ownHeads.has(sha);
    let sha = await read();
    for (let attempt = 1; stale(sha) && attempt <= 3; attempt++) {
      await sleep(250 * attempt);
      sha = await read();
    }
    return stale(sha) ? (latestPushed as string) : sha;
  }

  async function snapshot(): Promise<Snapshot> {
    return call(async () => {
      const commitSha = await headSha();
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
          blobSizes.set(entry.sha, entry.size ?? 0);
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

    /**
     * Checks the token can push to the repository and that the branch exists.
     * GitHub's "push" flag describes the account, not a fine-grained token, so
     * write access is proven by writing the empty blob: every repository with
     * a .gitkeep already has it, so nothing new appears.
     */
    async verify(): Promise<VerifyResult> {
      return call(async () => {
        const response = await octokit.rest.repos.get({ owner, repo });
        await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
        const headers = response.headers as Record<string, string | undefined>;
        let canPush = Boolean(response.data.permissions?.push);
        if (canPush) {
          try {
            await octokit.rest.git.createBlob({ owner, repo, content: '', encoding: 'utf-8' });
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 403 || status === 404) canPush = false;
            else throw error;
          }
        }
        return {
          canPush,
          expiresAt: parseTokenExpiry(headers['github-authentication-token-expiration']),
        };
      });
    },

    snapshot,
    readBlob,
    readText,

    /** Commits on the branch that touch `path` (a file or a folder), newest first. */
    async listCommits(
      options: { path?: string; page?: number; perPage?: number } = {},
    ): Promise<CommitPage> {
      return call(async () => {
        const response = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha: branch,
          path: options.path,
          page: options.page ?? 1,
          per_page: options.perPage ?? 20,
        });
        const link = (response.headers as Record<string, string | undefined>).link ?? '';
        return {
          commits: response.data.map((c) => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
            date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
          })),
          hasMore: /rel="next"/.test(link),
        };
      });
    },

    /** How many commits on the branch touch `path`. */
    async countCommits(path?: string): Promise<number> {
      return call(async () => {
        const response = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha: branch,
          path,
          per_page: 1,
        });
        const link = (response.headers as Record<string, string | undefined>).link ?? '';
        const last = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link);
        return last ? Number(last[1]) : response.data.length;
      });
    },

    /** One commit with its parents and changed files (cached: commits never change). */
    async commitDetail(sha: string): Promise<CommitDetail> {
      const cached = detailCache.get(sha);
      if (cached) return cached;
      const detail = await call(async () => {
        const { data } = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
        return {
          sha: data.sha,
          message: data.commit.message,
          author: data.commit.author?.name ?? data.author?.login ?? 'unknown',
          date: data.commit.author?.date ?? data.commit.committer?.date ?? '',
          parents: data.parents.map((p) => p.sha),
          files: (data.files ?? []).map((f) => ({
            path: f.filename,
            status: f.status as FileStatus,
            previousPath: f.previous_filename,
            sha: f.status === 'removed' ? null : (f.sha ?? null),
          })),
        };
      });
      detailCache.set(sha, detail);
      return detail;
    },

    /** Every file of the tree at `commitSha` (cached). */
    async treeAt(commitSha: string): Promise<Map<string, TreeFile>> {
      const cached = treeCache.get(commitSha);
      if (cached) return cached;
      const files = await call(async () => {
        const commit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: commitSha });
        const tree = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: commit.data.tree.sha,
          recursive: 'true',
        });
        const map = new Map<string, TreeFile>();
        for (const entry of tree.data.tree) {
          if (entry.type === 'blob' && entry.path && entry.sha) {
            map.set(entry.path, { path: entry.path, sha: entry.sha, size: entry.size ?? 0 });
            blobSizes.set(entry.sha, entry.size ?? 0);
          }
        }
        return map;
      });
      treeCache.set(commitSha, files);
      return files;
    },

    /**
     * The deploy state of a commit, combining commit statuses, deployments
     * and check runs. Anything the token may not read is skipped.
     */
    async siteStatus(sha: string): Promise<SiteState> {
      const states: SiteState[] = [];
      const fromStatus = (s: string | undefined | null): SiteState =>
        s === 'success'
          ? 'live'
          : s === 'failure' || s === 'error'
            ? 'failed'
            : s === 'pending' || s === 'queued' || s === 'in_progress'
              ? 'building'
              : 'unknown';
      await Promise.allSettled([
        (async () => {
          const { data } = await octokit.rest.repos.getCombinedStatusForRef({
            owner,
            repo,
            ref: sha,
          });
          if (data.total_count > 0) states.push(fromStatus(data.state));
        })(),
        (async () => {
          const { data } = await octokit.rest.repos.listDeployments({
            owner,
            repo,
            sha,
            per_page: 5,
          });
          for (const deployment of data) {
            const statuses = await octokit.rest.repos.listDeploymentStatuses({
              owner,
              repo,
              deployment_id: deployment.id,
              per_page: 1,
            });
            const latest = statuses.data[0];
            states.push(latest ? fromStatus(latest.state) : 'building');
          }
        })(),
        (async () => {
          const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref: sha });
          for (const run of data.check_runs) {
            if (run.status !== 'completed') states.push('building');
            else if (
              run.conclusion === 'success' ||
              run.conclusion === 'neutral' ||
              run.conclusion === 'skipped'
            ) {
              states.push('live');
            } else states.push('failed');
          }
        })(),
      ]);
      if (states.includes('failed')) return 'failed';
      if (states.includes('building')) return 'building';
      if (states.includes('live')) return 'live';
      return 'unknown';
    },

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
        const files = new Map(base.files);
        for (const change of request.changes) {
          if (change.action === 'delete') {
            tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
            after[change.path] = null;
            files.delete(change.path);
            continue;
          }
          let sha: string;
          let size: number;
          if (change.action === 'copy') {
            sha = change.sha;
            size = blobSizes.get(sha) ?? 0;
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
            size = bytes.length;
            blobSizes.set(sha, size);
          }
          tree.push({ path: change.path, mode: '100644', type: 'blob', sha });
          after[change.path] = sha;
          files.set(change.path, { path: change.path, sha, size });
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
        ownHeads.add(base.commitSha);
        ownHeads.add(commit.data.sha);
        latestPushed = commit.data.sha;
        return {
          commitSha: commit.data.sha,
          treeSha: newTree.data.sha,
          before,
          after,
          snapshot: { commitSha: commit.data.sha, treeSha: newTree.data.sha, files },
          message: request.message,
        };
      });
    },
  };
}
