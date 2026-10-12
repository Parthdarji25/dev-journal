export const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'parth.notes';
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

const owner = process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || '';
export const repoUrl = owner && repo ? `https://github.com/${owner}/${repo}` : '';

/** Origin of the separate artifacts site that serves uploaded HTML ('' when not configured). */
export const artifactsOrigin = (process.env.NEXT_PUBLIC_ARTIFACTS_ORIGIN || '').replace(/\/+$/, '');

export function artifactUrl(file: string): string {
  return artifactsOrigin
    ? `${artifactsOrigin}/${file.split('/').map(encodeURIComponent).join('/')}`
    : '';
}
