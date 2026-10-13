'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Becomes true once the first page has hydrated; later templates belong to client navigations. */
let hydrated = false;

/**
 * Remounts on every navigation, so pages after the first fade in (disabled
 * under reduced motion). The first page load is not animated: content that
 * starts at opacity 0 would not count as the Largest Contentful Paint.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [animate] = useState(() => hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return <div className={animate ? 'animate-page' : undefined}>{children}</div>;
}
