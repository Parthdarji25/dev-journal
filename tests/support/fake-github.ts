/**
 * An in-memory GitHub for tests: just the REST endpoints the admin uses,
 * backed by real git-like objects (blobs, flat trees, commits, refs). Use
 * `fake.fetch` as the fetch implementation (Vitest) or forward intercepted
 * requests to it (Playwright). No network is ever touched.
 */
import { createHash } from 'node:crypto';

type Json = Record<string, unknown>;

interface CommitObject {
  tree: string;
  parents: string[];
  message: string;
  /** ISO date-time (set when stored). */
  date?: string;
}

export interface FakeGitHubOptions {
  owner?: string;
  repo?: string;
  branch?: string;
  /** Initial files of the branch, path → text. */
  files?: Record<string, string>;
  /** The only token accepted (anything else gets 401). */
  token?: string;
  canPush?: boolean;
  /** Value of the github-authentication-token-expiration header. */
  tokenExpiration?: string;
}

export interface LoggedRequest {
  method: string;
  path: string;
  body?: Json;
}

const sha1 = (data: string | Uint8Array) => createHash('sha1').update(data).digest('hex');

export class FakeGitHub {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  token: string;
  canPush: boolean;
  tokenExpiration?: string;

  private readonly blobs = new Map<string, Uint8Array>();
  private readonly trees = new Map<string, Map<string, string>>();
  private readonly commits = new Map<string, CommitObject>();
  private readonly refs = new Map<string, string>();
  private counter = 0;

  /** Every request, in order. */
  readonly requests: LoggedRequest[] = [];
  /** Runs right before a ref update is applied (e.g. to simulate someone else pushing). */
  beforeRefUpdate?: () => void;
  /** Return a Response to short-circuit a request (e.g. 401, rate limit, server error). */
  intercept?: (method: string, path: string) => Response | undefined;
  /**
   * Replica lag: after each ref update, this many reads of the ref still
   * return the previous head, as GitHub can for a moment after a push.
   */
  staleRefReads = 0;
  private stale: { sha: string; reads: number } | null = null;

  constructor(options: FakeGitHubOptions = {}) {
    this.owner = options.owner ?? 'owner';
    this.repo = options.repo ?? 'repo';
    this.branch = options.branch ?? 'main';
    this.token = options.token ?? 'github_pat_test';
    this.canPush = options.canPush ?? true;
    this.tokenExpiration = options.tokenExpiration;
    const tree = this.storeTree(
      new Map(Object.entries(options.files ?? {}).map(([p, text]) => [p, this.storeBlob(text)])),
    );
    this.refs.set(this.branch, this.storeCommit({ tree, parents: [], message: 'Initial commit' }));
  }

  // ---------------------------------------------------------------- objects

  private storeBlob(content: string | Uint8Array): string {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const sha = sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), Buffer.from(bytes)]));
    this.blobs.set(sha, bytes);
    return sha;
  }

  private storeTree(entries: Map<string, string>): string {
    const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sha = sha1(`tree ${JSON.stringify(sorted)}`);
    this.trees.set(sha, new Map(sorted));
    return sha;
  }

  private storeCommit(commit: CommitObject): string {
    const n = this.counter++;
    const sha = sha1(`commit ${JSON.stringify(commit)} ${n}`);
    // Increasing dates, one minute apart, so ordering by date is stable.
    this.commits.set(sha, { ...commit, date: new Date(Date.UTC(2026, 9, 1, 8, n)).toISOString() });
    return sha;
  }

  /** Files a commit changed compared with its first parent, as the commits API reports them. */
  private diff(
    sha: string,
  ): { filename: string; status: string; sha: string | null; previous_filename?: string }[] {
    const commit = this.commits.get(sha) as CommitObject;
    const after = this.trees.get(commit.tree) as Map<string, string>;
    const parent = commit.parents[0]
      ? (this.commits.get(commit.parents[0]) as CommitObject)
      : undefined;
    const before = parent
      ? (this.trees.get(parent.tree) as Map<string, string>)
      : new Map<string, string>();
    const added = [...after.keys()].filter((p) => !before.has(p));
    const removed = [...before.keys()].filter((p) => !after.has(p));
    const out: {
      filename: string;
      status: string;
      sha: string | null;
      previous_filename?: string;
    }[] = [];
    const renamedFrom = new Set<string>();
    for (const p of added) {
      const from = removed.find((r) => !renamedFrom.has(r) && before.get(r) === after.get(p));
      if (from) {
        renamedFrom.add(from);
        out.push({
          filename: p,
          status: 'renamed',
          sha: after.get(p) as string,
          previous_filename: from,
        });
      } else out.push({ filename: p, status: 'added', sha: after.get(p) as string });
    }
    for (const p of removed)
      if (!renamedFrom.has(p))
        out.push({ filename: p, status: 'removed', sha: before.get(p) as string });
    for (const [p, blob] of after)
      if (before.has(p) && before.get(p) !== blob)
        out.push({ filename: p, status: 'modified', sha: blob });
    return out.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  /** Deploy signals tests can set per commit sha. */
  readonly commitStatuses = new Map<string, 'pending' | 'success' | 'failure'>();
  readonly deployments = new Map<string, 'in_progress' | 'success' | 'failure'>();

  // ---------------------------------------------------------------- inspection

  get headSha(): string {
    return this.refs.get(this.branch) as string;
  }

  /** Files of the branch head, path → text. */
  files(): Record<string, string> {
    const commit = this.commits.get(this.headSha) as CommitObject;
    const tree = this.trees.get(commit.tree) as Map<string, string>;
    return Object.fromEntries(
      [...tree.entries()].map(([path, sha]) => [
        path,
        new TextDecoder().decode(this.blobs.get(sha)),
      ]),
    );
  }

  blobShaOf(path: string): string | undefined {
    const commit = this.commits.get(this.headSha) as CommitObject;
    return this.trees.get(commit.tree)?.get(path);
  }

  /** Raw bytes of a file at the branch head (for binary files such as images). */
  bytesOf(path: string): Uint8Array | undefined {
    const sha = this.blobShaOf(path);
    return sha ? this.blobs.get(sha) : undefined;
  }

  /** Commits added to the branch after the initial one, newest first. */
  history(): { sha: string; message: string }[] {
    const out: { sha: string; message: string }[] = [];
    let sha: string | undefined = this.headSha;
    while (sha) {
      const commit = this.commits.get(sha) as CommitObject;
      if (commit.parents.length === 0) break;
      out.push({ sha, message: commit.message });
      sha = commit.parents[0];
    }
    return out;
  }

  /** How many commits were created through the API (POST /git/commits). */
  get commitsCreated(): number {
    return this.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/commits'))
      .length;
  }

  /** Simulates someone else pushing a commit to the branch. */
  externalPush(files: Record<string, string | null>, message = 'External change'): void {
    const head = this.commits.get(this.headSha) as CommitObject;
    const entries = new Map(this.trees.get(head.tree));
    for (const [path, text] of Object.entries(files)) {
      if (text === null) entries.delete(path);
      else entries.set(path, this.storeBlob(text));
    }
    const tree = this.storeTree(entries);
    this.refs.set(this.branch, this.storeCommit({ tree, parents: [this.headSha], message }));
  }

  // ---------------------------------------------------------------- HTTP

  private json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-expose-headers':
          'github-authentication-token-expiration, x-ratelimit-remaining, x-ratelimit-reset, retry-after',
        'x-ratelimit-remaining': '4999',
        ...headers,
      },
    });
  }

  private notFound() {
    return this.json(404, { message: 'Not Found' });
  }

  /** A fetch implementation answering like api.github.com. */
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : input.toString());
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const rawBody = init?.body ?? (request ? await request.text() : undefined);
    const body = typeof rawBody === 'string' && rawBody ? (JSON.parse(rawBody) as Json) : undefined;
    const path = decodeURIComponent(url.pathname);
    this.requests.push({ method, path, body });

    const injected = this.intercept?.(method, path);
    if (injected) return injected;

    const headers = new Headers(init?.headers ?? request?.headers);
    const auth = headers.get('authorization') ?? '';
    if (auth.replace(/^(token|bearer)\s+/i, '') !== this.token) {
      return this.json(401, { message: 'Bad credentials' });
    }

    const prefix = `/repos/${this.owner}/${this.repo}`;
    if (!path.startsWith(prefix)) return this.notFound();
    const rest = path.slice(prefix.length);

    if (method === 'GET' && rest === '') {
      return this.json(
        200,
        {
          full_name: `${this.owner}/${this.repo}`,
          default_branch: this.branch,
          permissions: { admin: false, push: this.canPush, pull: true },
        },
        this.tokenExpiration
          ? { 'github-authentication-token-expiration': this.tokenExpiration }
          : {},
      );
    }

    let m: RegExpExecArray | null;
    if (method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
      let sha = this.refs.get(m[1] as string);
      if (this.stale && this.stale.reads > 0) {
        this.stale.reads--;
        sha = this.stale.sha;
      }
      return sha
        ? this.json(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } })
        : this.notFound();
    }
    if (method === 'GET' && (m = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest))) {
      const commit = this.commits.get(m[1] as string);
      if (!commit) return this.notFound();
      return this.json(200, {
        sha: m[1],
        message: commit.message,
        tree: { sha: commit.tree },
        parents: commit.parents.map((sha) => ({ sha })),
      });
    }
    if (method === 'GET' && (m = /^\/git\/trees\/([^/]+)$/.exec(rest))) {
      const ref = m[1] as string;
      const treeSha = this.trees.has(ref)
        ? ref
        : this.refs.has(ref)
          ? (this.commits.get(this.refs.get(ref) as string) as CommitObject).tree
          : undefined;
      const tree = treeSha ? this.trees.get(treeSha) : undefined;
      if (!tree) return this.notFound();
      const dirs = new Set<string>();
      for (const p of tree.keys()) {
        const parts = p.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      return this.json(200, {
        sha: treeSha,
        truncated: false,
        tree: [
          ...[...dirs].map((d) => ({ path: d, mode: '040000', type: 'tree', sha: sha1(d) })),
          ...[...tree.entries()].map(([p, sha]) => ({
            path: p,
            mode: '100644',
            type: 'blob',
            sha,
            size: this.blobs.get(sha)?.length ?? 0,
          })),
        ],
      });
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/([0-9a-f]+)$/.exec(rest))) {
      const bytes = this.blobs.get(m[1] as string);
      if (!bytes) return this.notFound();
      return this.json(200, {
        sha: m[1],
        size: bytes.length,
        encoding: 'base64',
        content: Buffer.from(bytes).toString('base64'),
      });
    }
    if (method === 'GET' && rest === '/commits') {
      // History of the branch (first parents), filtered to commits touching `path`.
      const filter = url.searchParams.get('path');
      const perPage = Number(url.searchParams.get('per_page') ?? 30);
      const page = Number(url.searchParams.get('page') ?? 1);
      const list: string[] = [];
      let cursor: string | undefined = this.refs.get(url.searchParams.get('sha') ?? this.branch);
      while (cursor) {
        const touches =
          !filter ||
          this.diff(cursor).some(
            (f) =>
              f.filename === filter ||
              f.filename.startsWith(`${filter}/`) ||
              f.previous_filename === filter ||
              f.previous_filename?.startsWith(`${filter}/`),
          );
        if (touches) list.push(cursor);
        cursor = (this.commits.get(cursor) as CommitObject).parents[0];
      }
      const pages = Math.max(1, Math.ceil(list.length / perPage));
      const slice = list.slice((page - 1) * perPage, page * perPage);
      const base = `https://api.github.com${prefix}/commits?per_page=${perPage}`;
      const links = [
        page < pages ? `<${base}&page=${page + 1}>; rel="next"` : '',
        list.length > perPage ? `<${base}&page=${pages}>; rel="last"` : '',
      ].filter(Boolean);
      return this.json(
        200,
        slice.map((sha) => {
          const c = this.commits.get(sha) as CommitObject;
          return {
            sha,
            commit: { message: c.message, author: { name: 'Admin', date: c.date } },
            author: { login: 'admin' },
            parents: c.parents.map((p) => ({ sha: p })),
          };
        }),
        links.length ? { link: links.join(', ') } : {},
      );
    }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/status$/.exec(rest))) {
      const state = this.commitStatuses.get(m[1] as string);
      return this.json(200, {
        state: state ?? 'pending',
        total_count: state ? 1 : 0,
        statuses: [],
      });
    }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/check-runs$/.exec(rest))) {
      return this.json(403, { message: 'Resource not accessible by personal access token' });
    }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)$/.exec(rest))) {
      const sha = m[1] as string;
      const c = this.commits.get(sha);
      if (!c) return this.notFound();
      return this.json(200, {
        sha,
        commit: { message: c.message, author: { name: 'Admin', date: c.date } },
        author: { login: 'admin' },
        parents: c.parents.map((p) => ({ sha: p })),
        files: this.diff(sha),
      });
    }
    if (method === 'GET' && rest === '/deployments') {
      const sha = url.searchParams.get('sha') ?? '';
      const state = this.deployments.get(sha);
      return this.json(200, state ? [{ id: 1, sha, ref: this.branch }] : []);
    }
    if (method === 'GET' && rest === '/deployments/1/statuses') {
      const state = [...this.deployments.values()].at(-1);
      return this.json(200, state ? [{ state }] : []);
    }
    if (!this.canPush && method !== 'GET') {
      return this.json(403, { message: 'Resource not accessible by personal access token' });
    }
    if (method === 'POST' && rest === '/git/blobs') {
      const content = String(body?.content ?? '');
      const bytes =
        body?.encoding === 'base64'
          ? new Uint8Array(Buffer.from(content, 'base64'))
          : new TextEncoder().encode(content);
      return this.json(201, { sha: this.storeBlob(bytes) });
    }
    if (method === 'POST' && rest === '/git/trees') {
      const base = body?.base_tree
        ? this.trees.get(String(body.base_tree))
        : new Map<string, string>();
      if (!base) return this.json(422, { message: 'Invalid base_tree' });
      const entries = new Map(base);
      for (const entry of (body?.tree as { path: string; sha: string | null }[]) ?? []) {
        if (entry.sha === null) {
          if (!entries.has(entry.path))
            return this.json(422, { message: `Path ${entry.path} not found` });
          entries.delete(entry.path);
        } else {
          if (!this.blobs.has(entry.sha))
            return this.json(422, { message: `Blob ${entry.sha} not found` });
          entries.set(entry.path, entry.sha);
        }
      }
      const sha = this.storeTree(entries);
      return this.json(201, { sha, truncated: false });
    }
    if (method === 'POST' && rest === '/git/commits') {
      const tree = String(body?.tree ?? '');
      if (!this.trees.has(tree)) return this.json(422, { message: 'Invalid tree' });
      const sha = this.storeCommit({
        tree,
        parents: (body?.parents as string[]) ?? [],
        message: String(body?.message ?? ''),
      });
      return this.json(201, { sha });
    }
    if (method === 'PATCH' && (m = /^\/git\/refs\/heads\/(.+)$/.exec(rest))) {
      this.beforeRefUpdate?.();
      const branch = m[1] as string;
      const current = this.refs.get(branch);
      const next = String(body?.sha ?? '');
      const commit = this.commits.get(next);
      if (!current || !commit) return this.json(422, { message: 'Reference does not exist' });
      if (!body?.force && !commit.parents.includes(current)) {
        return this.json(422, { message: 'Update is not a fast forward' });
      }
      this.refs.set(branch, next);
      if (this.staleRefReads > 0) this.stale = { sha: current, reads: this.staleRefReads };
      return this.json(200, { ref: `refs/heads/${branch}`, object: { sha: next, type: 'commit' } });
    }
    return this.notFound();
  };
}
