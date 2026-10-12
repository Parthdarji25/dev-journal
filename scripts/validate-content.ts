/**
 * pnpm validate: checks content/ (or CONTENT_DIR) against the same zod schemas
 * the build uses, the folder rules and internal links. Exits 1 on any error.
 */
import { contentDir } from '@/lib/content/fs';
import { validateContent } from '@/lib/content/validate';

const root = contentDir();
const { errors, warnings, content } = validateContent(root);

for (const w of warnings) console.warn(`warning  ${w.file}: ${w.message}`);
for (const e of errors) console.error(`error    ${e.file}: ${e.message}`);

if (content) {
  const count =
    content.courses.reduce((n, c) => n + c.chapters.length, 0) +
    content.roadmaps.length +
    content.mindMaps.length +
    content.questions.length +
    content.cheatSheets.length +
    content.resources.length;
  console.log(
    `Checked ${root}: ${content.tracks.length} tracks, ${content.courses.length} courses, ${count} items.`,
  );
}

if (errors.length) {
  console.error(`\n${errors.length} error(s). Fix them before committing.`);
  process.exit(1);
}
console.log(`Content is valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
