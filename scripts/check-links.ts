/** pnpm check-links: fails when markdown links to a page the build does not emit. */
import { contentDir } from '@/lib/content/fs';
import { findBrokenLinks } from '@/lib/content/links';
import { loadContent } from '@/lib/content/load';

const root = contentDir();
const broken = findBrokenLinks(root, loadContent(root));

for (const b of broken) console.error(`${b.file}:${b.line}  ${b.url}  (${b.reason})`);
if (broken.length) {
  console.error(`\n${broken.length} broken link(s).`);
  process.exit(1);
}
console.log('No broken internal links.');
