import { isRateLimited, NetworkFailure } from './errors';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FetchOptions {
  /** The underlying fetch (tests pass a fake GitHub here). */
  fetch?: FetchLike;
  /** Waits between retries; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  /** Extra attempts for GET requests (spec: up to 3). */
  retries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function methodOf(input: string | URL | Request, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

/**
 * The fetch Octokit uses: never served from the HTTP cache (refs must be
 * fresh), GET requests retried up to 3 times with backoff on network errors
 * and 5xx responses, and network failures reported as NetworkFailure so the
 * admin can tell "offline" from other errors. Rate-limited responses are
 * returned as they are (no retry); the caller reports when the limit resets.
 */
export function createGitHubFetch(options: FetchOptions = {}): FetchLike {
  const baseFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const retries = options.retries ?? 3;

  return async (input, init) => {
    const method = methodOf(input, init);
    const attempts = method === 'GET' ? retries + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      if (isOffline()) throw new NetworkFailure(true);
      try {
        const response = await baseFetch(input, { ...init, cache: 'no-store' });
        const retryable =
          response.status >= 500 && !isRateLimited(response.status, response.headers);
        if (!retryable || attempt === attempts - 1) return response;
        lastError = new Error(`GitHub answered ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt === attempts - 1) throw new NetworkFailure(isOffline());
      }
    }
    throw lastError instanceof Error ? lastError : new NetworkFailure(isOffline());
  };
}
