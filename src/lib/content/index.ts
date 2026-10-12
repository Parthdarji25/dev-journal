import { contentDir } from './fs';
import { loadContent } from './load';
import type { Content } from './types';

export * from './errors';
export * from './load';
export * from './queries';
export * from './routes';
export * from './types';
export { contentDir } from './fs';

const cache = new Map<string, Content>();

/** The site's content, loaded once per process. Invalid content throws, failing the build. */
export function getContent(root = contentDir()): Content {
  let content = cache.get(root);
  if (!content) {
    content = loadContent(root);
    cache.set(root, content);
  }
  return content;
}
