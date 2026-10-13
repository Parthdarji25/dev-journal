'use client';

import { createContext, useContext } from 'react';
import type { RepoView } from '@/lib/admin/plan';
import type { Session } from '@/lib/admin/session';
import type { CommitResult, RepoClient, Snapshot } from '@/lib/github/client';

export interface Option {
  slug: string;
  name: string;
}

/** A commit made in this browser session. */
export interface PushedCommit {
  sha: string;
  message: string;
  date: string;
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
  /** Commits pushed in this session, newest first. */
  pushed: PushedCommit[];
  /** Reloads the branch from GitHub (to pick up changes made elsewhere). */
  refresh(): Promise<void>;
  /** Shows the branch as a commit just left it, instantly and without asking GitHub again. */
  applyCommit(result: CommitResult): void;
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
