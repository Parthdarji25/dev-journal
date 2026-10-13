'use client';

import { ExternalLink, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { buttonClass } from '@/components/ui/styles';
import { describeError } from '@/lib/admin/messages';
import {
  clearSession,
  loadSession,
  setSignInNotice,
  storageAvailable,
  type Session,
} from '@/lib/admin/session';
import { createRepoClient, type Snapshot } from '@/lib/github/client';
import { toGitHubError } from '@/lib/github/errors';
import { AdminContext, type AdminContextValue, type Option } from './admin-context';
import { ContentTab } from './content-tab';
import { formatDateTime } from './format';

type Boot = { kind: 'starting' } | { kind: 'no-storage' } | { kind: 'ready'; session: Session };

export function AdminApp({
  siteName,
  tracks,
  sections,
}: {
  siteName: string;
  tracks: Option[];
  sections: Option[];
}) {
  const router = useRouter();
  const [boot, setBoot] = useState<Boot>({ kind: 'starting' });

  useEffect(() => {
    // Storage and the session can only be read in the browser, after hydration.
    const session = storageAvailable() ? loadSession() : null;
    queueMicrotask(() => {
      if (!storageAvailable()) setBoot({ kind: 'no-storage' });
      else if (!session) router.replace('/admin/login');
      else setBoot({ kind: 'ready', session });
    });
  }, [router]);

  if (boot.kind === 'no-storage') {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold">Browser storage is blocked</h1>
        <p role="alert" className="mt-4 text-soft">
          The admin keeps your sign-in and your drafts in this browser&apos;s storage, which is not
          available here (for example in a private window). Allow site data for this site, or use a
          normal window, then reload.
        </p>
      </main>
    );
  }
  if (boot.kind === 'starting') {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-16 text-muted">
        Loading the admin...
      </main>
    );
  }
  return (
    <SignedIn siteName={siteName} session={boot.session} tracks={tracks} sections={sections} />
  );
}

function SignedIn({
  siteName,
  session,
  tracks,
  sections,
}: {
  siteName: string;
  session: Session;
  tracks: Option[];
  sections: Option[];
}) {
  const router = useRouter();
  const client = useMemo(() => createRepoClient(session), [session]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const handleError = useCallback(
    (error: unknown): string => {
      const e = toGitHubError(error);
      if (e.kind === 'auth') {
        setSignInNotice(
          'GitHub rejected the token (it may have expired or been revoked). Sign in again; your drafts are still saved in this browser.',
        );
        clearSession();
        router.replace('/admin/login');
      }
      return describeError(e, session.branch);
    },
    [router, session.branch],
  );

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await client.snapshot());
      setLoadError(null);
    } catch (error) {
      setLoadError(handleError(error));
    }
  }, [client, handleError]);

  useEffect(() => {
    let cancelled = false;
    client
      .snapshot()
      .then((s) => !cancelled && setSnapshot(s))
      .catch((error: unknown) => !cancelled && setLoadError(handleError(error)));
    return () => {
      cancelled = true;
    };
  }, [client, handleError]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    queueMicrotask(() => setOnline(navigator.onLine));
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [refresh]);

  const value = useMemo<AdminContextValue | null>(
    () =>
      snapshot && {
        session,
        client,
        snapshot,
        view: {
          files: snapshot.files,
          read: (path: string) => {
            const file = snapshot.files.get(path);
            if (!file) return Promise.reject(new Error(`${path} is not in the repository`));
            return client.readText(file.sha);
          },
        },
        repoKey: `${session.owner}/${session.repo}`,
        tracks,
        sections,
        refresh,
        handleError,
      },
    [snapshot, session, client, tracks, sections, refresh, handleError],
  );

  function signOut() {
    clearSession();
    router.replace('/admin/login');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 font-heading text-lg font-bold">
            {siteName}
            <span className="rounded-sm bg-text px-1.5 py-0.5 font-mono text-[11px] font-semibold text-bg">
              ADMIN
            </span>
          </span>
          <code className="font-mono text-sm text-muted">
            {session.owner}/{session.repo} · {session.branch}
          </code>
          <span className="text-sm text-soft">
            Signed in, token expires{' '}
            {session.expiresAt ? formatDateTime(session.expiresAt) : '(date not shared by GitHub)'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/" target="_blank" rel="noopener" className={buttonClass.ghost}>
              <ExternalLink aria-hidden className="size-4" />
              View site
            </a>
            <button type="button" onClick={signOut} className={buttonClass.ghost}>
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="Admin" className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6">
          <span
            aria-current="page"
            className="border-b-2 border-text px-3 py-2 text-sm font-semibold text-text"
          >
            Content
          </span>
        </nav>
      </header>

      {!online && (
        <p
          role="alert"
          className="flex items-center gap-2 bg-modified px-4 py-2 text-sm font-semibold text-bg"
        >
          <WifiOff aria-hidden className="size-4" />
          You&apos;re offline, your draft is safe
        </p>
      )}

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6"
      >
        {value ? (
          <AdminContext.Provider value={value}>
            <ContentTab />
          </AdminContext.Provider>
        ) : loadError ? (
          <div role="alert" className="rounded-lg border border-deleted bg-surface p-4">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className={`${buttonClass.secondary} mt-3`}
            >
              <RefreshCw aria-hidden className="size-4" />
              Try again
            </button>
          </div>
        ) : (
          <p className="text-muted">Loading the repository...</p>
        )}
      </main>
    </div>
  );
}
