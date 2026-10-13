import { AdminApp } from '@/components/admin/admin-app';
import { getContent } from '@/lib/content';
import { siteName } from '@/lib/site';

/** Client-only admin. Track and section names come from the build; files come from GitHub. */
export default function AdminPage() {
  const { tracks, sections } = getContent();
  return (
    <AdminApp
      siteName={siteName}
      tracks={tracks.map((t) => ({ slug: t.slug, name: t.name }))}
      sections={sections.map((s) => ({ slug: s.slug, name: s.name }))}
    />
  );
}
