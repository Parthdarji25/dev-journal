'use client';

import { Search } from 'lucide-react';
import { buttonClass } from '@/components/ui/styles';
import { prefetchSearch } from './search-launcher';

/** A button that opens the search palette (the palette listens for "open-search"). */
export function SearchTrigger({ label = 'Search everything' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-search'))}
      onMouseEnter={prefetchSearch}
      onFocus={prefetchSearch}
      className={buttonClass.primary}
    >
      <Search aria-hidden className="size-4" />
      {label}
    </button>
  );
}
