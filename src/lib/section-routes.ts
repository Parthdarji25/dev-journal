import type { Metadata } from 'next';
import { getContent, routes } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import type { SectionSlug, Track } from '@/lib/schema';

/** Shared bits of the /<section> and /<section>/[track] routes. */

export function trackParams() {
  return getContent().tracks.map((t) => ({ track: t.slug }));
}

export function findTrack(slug: string): Track | undefined {
  return getContent().tracks.find((t) => t.slug === slug);
}

/** The track a section's index page shows: the first one. */
export function firstTrack(): Track {
  const track = getContent().tracks[0];
  if (!track) throw new Error('tracks.json has no tracks');
  return track;
}

/**
 * Metadata for a section page. The index page's canonical URL is its first
 * track's page, because that is the content it shows.
 */
export function sectionMetadata(section: SectionSlug, track: Track | undefined): Metadata {
  const meta = getContent().sections.find((s) => s.slug === section);
  if (!meta || !track) return {};
  return pageMetadata(
    `${meta.name}: ${track.name}`,
    `${track.name} ${meta.name.toLowerCase()}. ${meta.description}`,
    routes.sectionTrack(section, track.slug),
  );
}
