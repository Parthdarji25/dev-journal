'use client';

import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { buttonClass } from '@/components/ui/styles';
import { describeError } from '@/lib/admin/messages';
import {
  defaultRepo,
  isFineGrainedToken,
  loadSession,
  parseRepoInput,
  saveSession,
  storageAvailable,
  takeSignInNotice,
  TOKEN_PREFIX,
} from '@/lib/admin/session';
import { createRepoClient } from '@/lib/github/client';
import { formatDateTime } from './format';

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'verified'; expiresAt: string | null };

const inputClass =
  'mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-text placeholder:text-muted';

export function LoginPage({ siteName }: { siteName: string }) {
  const router = useRouter();
  const defaults = defaultRepo();
  const [repository, setRepository] = useState(defaults.repository);
  const [branch, setBranch] = useState(defaults.branch);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [existing, setExisting] = useState<string | null>(null);
  const ids = { repo: useId(), branch: useId(), token: useId(), tokenHelp: useId() };

  useEffect(() => {
    // Reading browser storage has to wait until after hydration.
    const ok = storageAvailable();
    const session = ok ? loadSession() : null;
    const message = takeSignInNotice();
    queueMicrotask(() => {
      setStorageOk(ok);
      setNotice(message);
      if (session) {
        setExisting(`${session.owner}/${session.repo}`);
        setRepository(`${session.owner}/${session.repo}`);
        setBranch(session.branch);
      }
    });
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    const repo = parseRepoInput(repository);
    if (!repo) {
      setStatus({
        kind: 'error',
        message: 'Enter the repository as owner/name, for example octocat/notes.',
      });
      return;
    }
    if (!isFineGrainedToken(token)) {
      setStatus({
        kind: 'error',
        message: `Use a fine-grained personal access token. It starts with ${TOKEN_PREFIX}.`,
      });
      return;
    }
    setStatus({ kind: 'checking' });
    try {
      const client = createRepoClient({
        ...repo,
        branch: branch.trim() || 'main',
        token: token.trim(),
      });
      const result = await client.verify();
      if (!result.canPush) {
        setStatus({
          kind: 'error',
          message:
            'This token can read the repository but not write to it. Give it Contents: Read and write.',
        });
        return;
      }
      const saved = saveSession({
        token: token.trim(),
        owner: repo.owner,
        repo: repo.repo,
        branch: branch.trim() || 'main',
        expiresAt: result.expiresAt,
      });
      if (!saved) {
        setStorageOk(false);
        setStatus({ kind: 'idle' });
        return;
      }
      setToken('');
      setStatus({ kind: 'verified', expiresAt: result.expiresAt });
    } catch (error) {
      setStatus({ kind: 'error', message: describeError(error, branch) });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-heading text-lg font-bold">
            {siteName}
            <span className="rounded-sm bg-text px-1.5 py-0.5 font-mono text-[11px] font-semibold text-bg">
              ADMIN
            </span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 outline-none sm:px-6"
      >
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="mt-2 text-soft">
          The admin saves every change as a commit to GitHub. Sign in with a fine-grained token for
          the content repository.
        </p>

        {!storageOk && (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-lg border border-deleted bg-surface p-4"
          >
            <ShieldAlert aria-hidden className="size-5 shrink-0 text-deleted" />
            <p>
              Sign-in and drafts need browser storage, which this browser is blocking (for example
              in a private window). Allow site data for this site, or use a normal window, then
              reload this page.
            </p>
          </div>
        )}

        {notice && (
          <p role="alert" className="mt-6 rounded-lg border border-modified bg-surface p-4">
            {notice}
          </p>
        )}

        {existing && status.kind !== 'verified' && (
          <p className="mt-6 rounded-lg border border-border bg-surface p-4">
            You are signed in to {existing}.{' '}
            <Link href="/admin" className="font-semibold underline">
              Open admin
            </Link>
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <form onSubmit={verify} noValidate className="space-y-5">
            <div>
              <label htmlFor={ids.repo} className="font-semibold">
                Repository
              </label>
              <input
                id={ids.repo}
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                placeholder="owner/name"
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={ids.branch} className="font-semibold">
                Branch
              </label>
              <input
                id={ids.branch}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={ids.token} className="font-semibold">
                Fine-grained token
              </label>
              <input
                id={ids.token}
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={`${TOKEN_PREFIX}...`}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={ids.tokenHelp}
                className={`${inputClass} font-mono`}
              />
              <p id={ids.tokenHelp} className="mt-1 text-sm text-muted">
                Kept only in this browser&apos;s storage. It is sent to api.github.com and nowhere
                else.
              </p>
            </div>

            <button
              type="submit"
              disabled={!storageOk || status.kind === 'checking'}
              className={`${buttonClass.primary} disabled:opacity-50`}
            >
              <KeyRound aria-hidden className="size-4" />
              {status.kind === 'checking' ? 'Verifying...' : 'Verify'}
            </button>

            <div aria-live="polite">
              {status.kind === 'error' && (
                <p
                  role="alert"
                  className="rounded-lg border border-deleted bg-surface p-4 text-text"
                >
                  {status.message}
                </p>
              )}
              {status.kind === 'verified' && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-added bg-surface p-4">
                  <p className="flex items-center gap-2">
                    <CheckCircle2 aria-hidden className="size-5 text-added" />
                    Token verified, write access, expires{' '}
                    {status.expiresAt
                      ? formatDateTime(status.expiresAt)
                      : 'on a date GitHub did not share'}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/admin')}
                    className={buttonClass.primary}
                  >
                    Open admin
                  </button>
                </div>
              )}
            </div>
          </form>

          <aside className="h-fit rounded-lg border border-border bg-surface p-4 text-sm">
            <h2 className="text-base">Token setup</h2>
            <p className="mt-2 text-soft">
              Create a{' '}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                fine-grained token
              </a>{' '}
              with:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-soft">
              <li>Repository access: only this repository</li>
              <li>Contents: Read and write</li>
              <li>Metadata: Read</li>
              <li>Commit statuses: Read</li>
              <li>Deployments: Read</li>
              <li>An expiry date</li>
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
