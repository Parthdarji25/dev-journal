import { notFound } from 'next/navigation';
import { CheatSheetsView } from '@/components/content/cheat-sheets-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { findTrack, sectionMetadata } from '@/lib/section-routes';

/*
 * /cheat-sheets/<track> shows the track's first sheet; /cheat-sheets/<track>/<sheet>
 * shows that sheet. The optional catch-all keeps generateStaticParams non-empty
 * (one entry per track) even when no sheets exist.
 */

type Props = { params: Promise<{ track: string; sheet?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  const { tracks, cheatSheets } = getContent();
  return [
    ...tracks.map((t) => ({ track: t.slug, sheet: [] })),
    ...cheatSheets.map((s) => ({ track: s.track, sheet: [s.slug] })),
  ];
}

function resolve(trackSlug: string, sheet: string[] = []) {
  const track = findTrack(trackSlug);
  if (!track || sheet.length > 1) return null;
  const sheets = getContent().cheatSheets.filter((s) => s.track === track.slug);
  const selected = sheet[0] ? sheets.find((s) => s.slug === sheet[0]) : sheets[0];
  if (sheet[0] && !selected) return null;
  return { track, sheets, selected, own: Boolean(sheet[0]) };
}

export async function generateMetadata({ params }: Props) {
  const { track, sheet } = await params;
  const r = resolve(track, sheet);
  if (!r) return {};
  if (r.own && r.selected) {
    return pageMetadata(
      `${r.selected.title} cheat sheet`,
      r.selected.description || `${r.track.name} cheat sheet`,
      r.selected.href,
    );
  }
  return sectionMetadata('cheat-sheets', r.track);
}

export default async function CheatSheetsTrackPage({ params }: Props) {
  const { track, sheet } = await params;
  const r = resolve(track, sheet);
  if (!r) notFound();
  return (
    <SectionPage section="cheat-sheets" track={r.track}>
      {r.selected ? (
        <CheatSheetsView sheets={r.sheets} selected={r.selected} indexed={r.own} />
      ) : null}
    </SectionPage>
  );
}
