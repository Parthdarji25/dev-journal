/** Shared class strings for link-buttons and buttons (44px touch targets). */
export const buttonClass = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-text px-4 font-semibold text-bg transition-opacity hover:opacity-85',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-text transition-colors hover:bg-nav-active',
  ghost:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 font-semibold text-soft transition-colors hover:bg-nav-active hover:text-text',
} as const;

export const containerClass = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
