import { RoadmapView } from '@/components/content/roadmap-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { firstTrack, sectionMetadata } from '@/lib/section-routes';

export function generateMetadata() {
  return sectionMetadata('roadmaps', firstTrack());
}

export default function RoadmapIndexPage() {
  const track = firstTrack();
  const roadmap = getContent().roadmaps.find((r) => r.track === track.slug);
  return (
    <SectionPage section="roadmaps" track={track} isIndex>
      {roadmap ? <RoadmapView roadmap={roadmap} indexed={false} /> : null}
    </SectionPage>
  );
}
