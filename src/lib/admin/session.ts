/**
 * The admin session: the token and repository, kept in localStorage only
 * (never in URLs, cookies or logs).
 */

export interface Session {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  /** ISO date-time the token expires, when GitHub reported it. */
  expiresAt: string | null;
}

const SESSION_KEY = 'parth-notes:admin:session';
const NOTICE_KEY = 'parth-notes:admin:notice';

export const TOKEN_PREFIX = 'github_pat_';

export function isFineGrainedToken(token: string): boolean {
  return token.trim().startsWith(TOKEN_PREFIX) && token.trim().length > TOKEN_PREFIX.length;
}

/** "owner/repo" or a github.com URL to its parts. */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(cleaned);
  return match ? { owner: match[1] as string, repo: match[2] as string } : null;
}

export function defaultRepo() {
  const owner = process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || '';
  return {
    repository: owner && repo ? `${owner}/${repo}` : '',
    branch: process.env.NEXT_PUBLIC_GITHUB_BRANCH || 'main',
  };
}

/** Whether localStorage can be written (private mode or blocked storage say no). */
export function storageAvailable(): boolean {
  try {
    const probe = 'parth-notes:admin:probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (!s.token || !s.owner || !s.repo || !s.branch) return null;
    return {
      token: s.token,
      owner: s.owner,
      repo: s.repo,
      branch: s.branch,
      expiresAt: s.expiresAt ?? null,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Session): boolean {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored.
  }
}

/** A message for the sign-in page after being sent back (for example on a 401). */
export function setSignInNotice(message: string): void {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    // The sign-in page then shows no notice.
  }
}

export function takeSignInNotice(): string | null {
  try {
    const message = window.sessionStorage.getItem(NOTICE_KEY);
    window.sessionStorage.removeItem(NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}
