'use client';

import { useEffect, useState } from 'react';
import type { SiteState } from '@/lib/github/client';
import { useAdmin } from './admin-context';

const POLL_MS = 10_000;
/** How long after a push from this session an unreported deploy still counts as building. */
const GRACE_MS = 3 * 60_000;

const LABEL: Record<SiteState | 'checking', { text: string; dot: string }> = {
  checking: { text: 'Checking the site...', dot: 'bg-muted' },
  building: { text: 'Building...', dot: 'bg-modified animate-pulse' },
  live: { text: 'Live', dot: 'bg-added' },
  failed: { text: 'Failed', dot: 'bg-deleted' },
  unknown: { text: 'No deploy status', dot: 'bg-dash' },
};

/**
 * Deploy state of the latest commit on the branch, from its commit statuses,
 * deployments and check runs; polled every 10s while building.
 */
export function SiteStatus() {
  const { client, snapshot, pushed } = useAdmin();
  const [state, setState] = useState<SiteState | 'checking'>('checking');
  const sha = snapshot.commitSha;
  const ours = pushed.find((p) => p.sha === sha);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const check = async () => {
      let next = await client.siteStatus(sha).catch((): SiteState => 'unknown');
      // Right after a push the host may not have reported anything yet.
      if (next === 'unknown' && ours && Date.now() - Date.parse(ours.date) < GRACE_MS)
        next = 'building';
      if (cancelled) return;
      setState(next);
      if (next === 'building') timer = window.setTimeout(() => void check(), POLL_MS);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, sha, ours]);

  const { text, dot } = LABEL[state];
  return (
    <span
      role="status"
      title={`Deploy of ${sha.slice(0, 7)}, the latest commit on the branch`}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-soft"
    >
      <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
      <span>
        <span className="sr-only">Site status: </span>
        {text}
      </span>
    </span>
  );
}
