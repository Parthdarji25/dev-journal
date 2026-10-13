import { notFound } from 'next/navigation';
import { MindMapsView } from '@/components/content/mind-maps-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { findTrack, sectionMetadata } from '@/lib/section-routes';

/*
 * /mind-maps/<track> shows the track's first map; /mind-maps/<track>/<map>
 * shows that map. The optional catch-all keeps generateStaticParams non-empty
 * (one entry per track) even when no maps exist.
 */

type Props = { params: Promise<{ track: string; map?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  const { tracks, mindMaps } = getContent();
  return [
    ...tracks.map((t) => ({ track: t.slug, map: [] })),
    ...mindMaps.map((m) => ({ track: m.track, map: [m.slug] })),
  ];
}

function resolve(trackSlug: string, map: string[] = []) {
  const track = findTrack(trackSlug);
  if (!track || map.length > 1) return null;
  const maps = getContent().mindMaps.filter((m) => m.track === track.slug);
  const selected = map[0] ? maps.find((m) => m.slug === map[0]) : maps[0];
  if (map[0] && !selected) return null;
  return { track, maps, selected, own: Boolean(map[0]) };
}

export async function generateMetadata({ params }: Props) {
  const { track, map } = await params;
  const r = resolve(track, map);
  if (!r) return {};
  if (r.own && r.selected) {
    return pageMetadata(
      `${r.selected.title} mind map`,
      `${r.track.name} mind map: ${r.selected.title}`,
      r.selected.href,
    );
  }
  return sectionMetadata('mind-maps', r.track);
}

export default async function MindMapsTrackPage({ params }: Props) {
  const { track, map } = await params;
  const r = resolve(track, map);
  if (!r) notFound();
  return (
    <SectionPage section="mind-maps" track={r.track}>
      {r.selected ? <MindMapsView maps={r.maps} selected={r.selected} indexed={r.own} /> : null}
    </SectionPage>
  );
}
