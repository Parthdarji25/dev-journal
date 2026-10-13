import { MindMapsView } from '@/components/content/mind-maps-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { firstTrack, sectionMetadata } from '@/lib/section-routes';

export function generateMetadata() {
  return sectionMetadata('mind-maps', firstTrack());
}

export default function MindMapsIndexPage() {
  const track = firstTrack();
  const maps = getContent().mindMaps.filter((m) => m.track === track.slug);
  const selected = maps[0];
  return (
    <SectionPage section="mind-maps" track={track} isIndex>
      {selected ? <MindMapsView maps={maps} selected={selected} indexed={false} /> : null}
    </SectionPage>
  );
}
