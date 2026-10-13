/**
 * Browser-side Pagefind access. The script and index live at /pagefind/ in
 * the built site (written by `pagefind --site out`), outside the JS bundle.
 */

export interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
}

export interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: { title?: string };
  filters: Record<string, string[]>;
  sub_results: PagefindSubResult[];
}

interface PagefindResult {
  id: string;
  data(): Promise<PagefindResultData>;
}

interface PagefindModule {
  options(options: Record<string, unknown>): Promise<void>;
  init(): Promise<void>;
  search(
    term: string,
    options?: { filters?: Record<string, string> },
  ): Promise<{ results: PagefindResult[] }>;
}

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  /** Pagefind excerpt: escaped text with <mark> around matches. */
  excerpt: string;
  section?: string;
  track?: string;
}

export interface SearchFilters {
  section?: string;
  track?: string;
}

const PAGEFIND_URL = '/pagefind/pagefind.js';
let modulePromise: Promise<PagefindModule> | null = null;

/** Imports the Pagefind script once. Its index files load on the first search. */
export function loadPagefind(): Promise<PagefindModule> {
  modulePromise ??= (
    import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ PAGEFIND_URL
    ) as Promise<PagefindModule>
  )
    .then(async (pagefind) => {
      await pagefind.options({ excerptLength: 18 });
      return pagefind;
    })
    .catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
  return modulePromise;
}

/** "/a/b.html" and "/a/b/index.html" become "/a/b"; query and hash are kept. */
export function cleanUrl(url: string): string {
  const [path = '', rest = ''] = url.split(/(?=[?#])/);
  const clean = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return (clean.length > 1 ? clean.replace(/\/$/, '') : clean || '/') + rest;
}

/** Pages whose headings are separate items, so each heading becomes its own result. */
const EXPAND_SUB_RESULTS = new Set(['interview-questions']);

/** Turns Pagefind result data into palette rows. */
export function toSearchResults(data: PagefindResultData[]): SearchResult[] {
  return data.flatMap((d) => {
    const section = d.filters.section?.[0];
    const track = d.filters.track?.[0];
    const pageUrl = cleanUrl(d.url);
    if (section && EXPAND_SUB_RESULTS.has(section)) {
      const items = d.sub_results.filter((s) => s.url.includes('#'));
      if (items.length > 0) {
        return items.map((s) => ({
          id: s.url,
          url: cleanUrl(s.url),
          title: s.title,
          excerpt: s.excerpt,
          section,
          track,
        }));
      }
    }
    return [
      {
        id: d.url,
        url: pageUrl,
        title: d.meta.title ?? pageUrl,
        excerpt: d.excerpt,
        section,
        track,
      },
    ];
  });
}

const MAX_RESULTS = 20;

async function indexIsEmpty(): Promise<boolean> {
  try {
    // /pagefind files are cached for a year; the entry changes with every content deploy.
    const entry = (await (
      await fetch('/pagefind/pagefind-entry.json', { cache: 'no-cache' })
    ).json()) as {
      languages?: Record<string, unknown>;
    };
    return Object.keys(entry.languages ?? {}).length === 0;
  } catch {
    return false;
  }
}

export async function search(term: string, filters: SearchFilters): Promise<SearchResult[]> {
  const pagefind = await loadPagefind();
  const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<
    string,
    string
  >;
  let results: PagefindResult[];
  try {
    ({ results } = await pagefind.search(term, { filters: active }));
  } catch (error) {
    // A site with no content has an index with no languages, which Pagefind cannot search.
    if (await indexIsEmpty()) return [];
    throw error;
  }
  const data = await Promise.all(results.slice(0, MAX_RESULTS).map((r) => r.data()));
  return toSearchResults(data);
}
