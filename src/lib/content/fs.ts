import fs from 'node:fs';
import path from 'node:path';

/** Content root: CONTENT_DIR (used for fixtures) or ./content. */
export function contentDir(): string {
  return path.resolve(process.cwd(), process.env.CONTENT_DIR || 'content');
}

export interface Entry {
  name: string;
  isDir: boolean;
}

/** Directory entries sorted by name; a missing folder reads as empty. */
export function listEntries(dir: string): Entry[] {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return dirents
    .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function exists(file: string): boolean {
  return fs.existsSync(file);
}

/** Path relative to `root` with forward slashes, for messages and URLs. */
export function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

/** Config files, placeholders and asset folders are not content items. */
export function isItemFile(entry: Entry): boolean {
  return !entry.isDir && !entry.name.startsWith('_') && !entry.name.startsWith('.');
}
