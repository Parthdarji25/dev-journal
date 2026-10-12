import type { ReactNode } from 'react';
import type { Track } from '@/lib/schema';
import { trackClass } from '@/lib/nav';

/**
 * A track's content panel: 4px top border in the track colour on the track
 * tint, headed by the track name and its content folder path.
 */
export function TrackPanel({
  track,
  folder,
  children,
  footer,
  headingLevel = 2,
  id,
}: {
  track: Track;
  folder: string;
  children: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      id={id}
      data-track-panel={track.slug}
      aria-labelledby={`${id ?? track.slug}-title`}
      className={`${trackClass(track.slug)} scroll-mt-24 rounded-xl border border-border border-t-4 border-t-(--tc) bg-(--tt) p-4 sm:p-6`}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Heading id={`${id ?? track.slug}-title`} className="text-xl">
          {track.name}
        </Heading>
        <code className="font-mono text-xs text-muted">{folder}</code>
      </div>
      {children}
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}
