import Link from 'next/link';
import { SiteChrome } from '@/components/layout/site-chrome';
import { buttonClass, containerClass } from '@/components/ui/styles';

export const metadata = { title: 'Page not found', robots: { index: false } };

/** Lives outside the (site) group, so it renders the public chrome itself. */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className={`${containerClass} py-24`}>
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-2 text-4xl font-bold">Page not found</h1>
        <p className="mt-4 max-w-xl text-lg text-soft">
          This page does not exist, or it has moved. Try searching, or start from the home page.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className={buttonClass.primary}>
            Go home
          </Link>
          <Link href="/learning-notes" className={buttonClass.secondary}>
            Learning Notes
          </Link>
        </div>
      </div>
    </SiteChrome>
  );
}
