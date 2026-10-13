/**
 * Drafts autosaved in this browser, one per file (or per "new item" slot),
 * per repository. They survive errors, sign-outs and reloads; only a
 * successful commit or an explicit Discard removes them.
 */

export interface Draft {
  title: string;
  text: string;
  courseName?: string;
  /** Blob sha the draft started from (null for a new item). */
  baseSha: string | null;
  savedAt: number;
  format?: 'md' | 'html';
  /** HTML chapter metadata. */
  description?: string;
  tags?: string;
  /** An uploaded HTML file (its text, when it fits in browser storage). */
  html?: { name: string; size: number; text?: string };
  /** Images uploaded while editing, base64-encoded. */
  images?: { name: string; width: number; height: number; base64: string }[];
}

const PREFIX = 'parth-notes:admin:draft:';

function key(repoKey: string, draftKey: string): string {
  return `${PREFIX}${repoKey}:${draftKey}`;
}

/** The draft slot of a new item in a list. */
export function newItemKey(section: string, track: string, course?: string): string {
  return `new:${section}/${track}${course ? `/${course}` : ''}`;
}

export function loadDraft(repoKey: string, draftKey: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key(repoKey, draftKey));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(repoKey: string, draftKey: string, draft: Draft): boolean {
  try {
    window.localStorage.setItem(key(repoKey, draftKey), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(repoKey: string, draftKey: string): void {
  try {
    window.localStorage.removeItem(key(repoKey, draftKey));
  } catch {
    // Nothing stored.
  }
}
