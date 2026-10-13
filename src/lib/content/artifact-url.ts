import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { artifactUrl } from '@/lib/site';
import { contentDir } from './fs';

/**
 * Bump when the artifacts site's headers change: browsers revalidate a cached
 * artifact, and Vercel's 304 answer carries no CSP, so without a new address
 * they would keep the old headers (an old frame-ancestors 'none' blocked every
 * frame until the URL changed).
 */
const HEADERS_VERSION = '2';

/**
 * The artifact's address on the artifacts site, versioned by its content: a
 * replaced artifact, or new headers, give it a new URL that no browser has
 * cached. Build-time only (it reads the file).
 */
export function versionedArtifactUrl(file: string): string {
  const url = artifactUrl(file);
  if (!url) return url;
  try {
    const version = createHash('sha256')
      .update(fs.readFileSync(path.join(contentDir(), file)))
      .update(HEADERS_VERSION)
      .digest('hex')
      .slice(0, 12);
    return `${url}?v=${version}`;
  } catch {
    return url;
  }
}
