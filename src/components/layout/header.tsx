import Link from 'next/link';
import { siteName } from '@/lib/site';
import { ThemeToggle } from './theme-toggle';

// Phase 1 shell. The LEARN / PRACTICE / TRACKS menus, search and mobile drawer arrive in Phase 3.
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-heading text-lg font-bold text-text hover:text-soft">
          {siteName}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
