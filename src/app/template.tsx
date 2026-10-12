import type { ReactNode } from 'react';

/** Remounts on every navigation, so each page fades in (disabled under reduced motion). */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
