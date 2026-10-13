import { CheatSheetsView } from '@/components/content/cheat-sheets-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { firstTrack, sectionMetadata } from '@/lib/section-routes';

export function generateMetadata() {
  return sectionMetadata('cheat-sheets', firstTrack());
}

export default function CheatSheetsIndexPage() {
  const track = firstTrack();
  const sheets = getContent().cheatSheets.filter((s) => s.track === track.slug);
  const selected = sheets[0];
  return (
    <SectionPage section="cheat-sheets" track={track} isIndex>
      {selected ? <CheatSheetsView sheets={sheets} selected={selected} indexed={false} /> : null}
    </SectionPage>
  );
}
