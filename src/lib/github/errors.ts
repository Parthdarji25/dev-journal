/**
 * Every failure of a GitHub call becomes a GitHubError with a `kind` the admin
 * can turn into a plain-words message. Drafts are never touched on errors.
 */
export type GitHubErrorKind =
  | 'auth' // 401: token expired, revoked or wrong
  | 'forbidden' // 403 without rate limiting: the token lacks a permission
  | 'not-found' // 404: repository, branch or object missing (or not visible to the token)
  | 'rate-limit' // 403/429 with the rate limit exhausted
  | 'offline' // the browser is offline
  | 'network' // the request failed without a response
  | 'conflict' // the branch moved or a file changed since it was opened
  | 'refused' // 422: GitHub rejected the data (for example a file over 100 MB)
  | 'unknown';

export type ConflictReason = 'moved' | 'changed';

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly details: {
      status?: number;
      /** When the rate limit resets (rate-limit). */
      resetAt?: Date;
      /** Why a write conflicted (conflict). */
      reason?: ConflictReason;
      /** Files that changed on GitHub since they were opened (conflict, reason 'changed'). */
      paths?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/** Thrown by the fetch wrapper before Octokit sees a response. */
export class NetworkFailure extends Error {
  constructor(readonly offline: boolean) {
    super(offline ? 'You are offline' : 'The request to GitHub failed');
    this.name = 'NetworkFailure';
  }
}

interface OctokitLikeError {
  status?: number;
  message?: string;
  cause?: unknown;
  response?: { headers?: Record<string, string | undefined>; data?: unknown };
}

function githubMessage(error: OctokitLikeError): string {
  const data = error.response?.data as
    { message?: string; errors?: { message?: string }[] } | undefined;
  const extra = data?.errors
    ?.map((e) => e.message)
    .filter(Boolean)
    .join('; ');
  return [data?.message ?? error.message ?? 'GitHub returned an error', extra]
    .filter(Boolean)
    .join(': ');
}

/** True for 403/429 responses caused by an exhausted rate limit. */
export function isRateLimited(
  status: number,
  headers: Headers | Record<string, string | undefined>,
): boolean {
  const get = (name: string) =>
    headers instanceof Headers ? headers.get(name) : (headers[name] ?? headers[name.toLowerCase()]);
  if (status === 429) return true;
  return status === 403 && (get('x-ratelimit-remaining') === '0' || get('retry-after') != null);
}

export function rateLimitReset(headers: Record<string, string | undefined>): Date | undefined {
  const reset = Number(headers['x-ratelimit-reset']);
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000);
  const retryAfter = Number(headers['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter >= 0)
    return new Date(Date.now() + retryAfter * 1000);
  return undefined;
}

/** Converts whatever Octokit (or our fetch wrapper) threw into a GitHubError. */
export function toGitHubError(error: unknown): GitHubError {
  if (error instanceof GitHubError) return error;
  if (error instanceof NetworkFailure) {
    return new GitHubError(error.offline ? 'offline' : 'network', error.message);
  }
  const e = (error ?? {}) as OctokitLikeError;
  if (e.cause instanceof NetworkFailure) return toGitHubError(e.cause);
  const status = typeof e.status === 'number' ? e.status : undefined;
  const headers = e.response?.headers ?? {};
  if (status === 401) return new GitHubError('auth', 'GitHub rejected the token', { status });
  if (status && isRateLimited(status, headers)) {
    return new GitHubError('rate-limit', 'GitHub rate limit reached', {
      status,
      resetAt: rateLimitReset(headers),
    });
  }
  if (status === 403) return new GitHubError('forbidden', githubMessage(e), { status });
  if (status === 404) return new GitHubError('not-found', githubMessage(e), { status });
  if (status === 409)
    return new GitHubError('conflict', githubMessage(e), { status, reason: 'moved' });
  if (status === 422) return new GitHubError('refused', githubMessage(e), { status });
  if (status === 500 && !e.response) {
    // Octokit reports a fetch that never got a response as status 500 without a response.
    return new GitHubError('network', e.message ?? 'The request to GitHub failed', { status });
  }
  return new GitHubError('unknown', githubMessage(e), { status });
}
