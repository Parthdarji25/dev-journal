import { trackClass } from '@/lib/nav';

/** Small square (or dot) in a track's colour. Wraps itself in the track scope. */
export function TrackMark({
  track,
  shape = 'square',
}: {
  track: string;
  shape?: 'square' | 'dot';
}) {
  return (
    <span
      aria-hidden
      className={`${trackClass(track)} inline-block size-2.5 shrink-0 bg-(--tc) ${shape === 'dot' ? 'rounded-full' : 'rounded-[3px]'}`}
    />
  );
}
