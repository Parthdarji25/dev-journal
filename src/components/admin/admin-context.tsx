'use client';

import { createContext, useContext } from 'react';
import type { RepoView } from '@/lib/admin/plan';
import type { Session } from '@/lib/admin/session';
import type { RepoClient, Snapshot } from '@/lib/github/client';

export interface Option {
  slug: string;
  name: string;
}

export interface AdminContextValue {
  session: Session;
  client: RepoClient;
  snapshot: Snapshot;
  /** The planners' view of `snapshot`. */
  view: RepoView;
  /** Key for drafts of this repository. */
  repoKey: string;
  tracks: Option[];
  sections: Option[];
  /** Reloads the branch from GitHub. */
  refresh(): Promise<void>;
  /**
   * Handles an error from a GitHub call: a rejected token sends the user to
   * sign-in (drafts stay), anything else comes back as a message to show.
   */
  handleError(error: unknown): string;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside the admin');
  return value;
}
