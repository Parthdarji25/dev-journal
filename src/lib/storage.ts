/**
 * localStorage that never throws: private mode or blocked storage makes the
 * public site fall back to defaults silently.
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

/** The track a visitor last chose in any category bar. */
export const LAST_TRACK_KEY = 'last-track';
