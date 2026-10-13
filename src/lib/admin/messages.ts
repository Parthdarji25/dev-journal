import { GitHubError, toGitHubError } from '@/lib/github/errors';

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** One plain-words sentence (or two) for any error from a GitHub call. Drafts are always kept. */
export function describeError(error: unknown, branch = 'main'): string {
  const e = error instanceof GitHubError ? error : toGitHubError(error);
  switch (e.kind) {
    case 'auth':
      return 'GitHub rejected the token (it may have expired or been revoked). Sign in again; your draft is kept.';
    case 'forbidden':
      return `The token is not allowed to do this (${e.message}). It needs Contents read and write on this repository.`;
    case 'not-found':
      return 'GitHub could not find the repository, branch or file. Check the name, and that the token can access this repository.';
    case 'rate-limit':
      return e.details.resetAt
        ? `GitHub's rate limit is used up. It resets at ${time.format(e.details.resetAt)}. Your draft is kept.`
        : "GitHub's rate limit is used up. Try again in a few minutes. Your draft is kept.";
    case 'offline':
      return "You're offline, your draft is safe";
    case 'network':
      return 'Could not reach GitHub. Your draft is kept; try again in a moment.';
    case 'conflict':
      return e.details.reason === 'changed'
        ? `Changed on GitHub after you opened it: ${(e.details.paths ?? []).join(', ')}. Nothing was overwritten and your draft is kept. Reload to see the latest version.`
        : `Someone else pushed to ${branch} while you were saving. Nothing was overwritten. Try again to commit on top of the latest version.`;
    case 'refused':
      return `GitHub refused the change: ${e.message}. Your draft is kept.`;
    default:
      return `GitHub returned an error: ${e.message}. Your draft is kept.`;
  }
}
