'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Both icons are rendered and swapped with the `dark` class, so the button
 * markup is identical on the server and the client and never flashes.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-surface text-soft transition-colors hover:bg-nav-active hover:text-text"
    >
      <Sun aria-hidden className="size-5 dark:hidden" />
      <Moon aria-hidden className="hidden size-5 dark:block" />
    </button>
  );
}
