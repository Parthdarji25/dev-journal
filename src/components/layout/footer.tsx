import { GitCommitHorizontal } from 'lucide-react';
import { containerClass } from '@/components/ui/styles';
import { repoUrl, siteName } from '@/lib/site';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div
        className={`${containerClass} flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between`}
      >
        <p>
          <span className="font-semibold text-soft">{siteName}</span> · Stored as files on GitHub,
          every change is a commit
        </p>
        {repoUrl && (
          <a
            href={repoUrl}
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-soft hover:text-text"
            rel="noopener noreferrer"
          >
            <GitCommitHorizontal aria-hidden className="size-4" />
            View the repository
          </a>
        )}
      </div>
    </footer>
  );
}
