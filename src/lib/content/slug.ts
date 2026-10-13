/**
 * File-name helpers shared by the build and the admin panel (browser safe, no Node APIs).
 */

const CHAR_MAP: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŋ: 'ng',
  '&': ' and ',
  '+': ' plus ',
  '@': ' at ',
  // Greek
  α: 'a',
  β: 'b',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
  // Cyrillic (Russian and Ukrainian)
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const MAX_LENGTH = 80;

/**
 * Lowercase ASCII kebab-case. Accents are stripped, Greek and Cyrillic are
 * transliterated, anything else becomes a separator. Returns '' when nothing
 * usable is left (symbols only, CJK, emoji).
 */
export function slugify(input: string): string {
  const mapped = Array.from(input.toLowerCase().normalize('NFKD'))
    .map((ch) => CHAR_MAP[ch] ?? ch)
    .join('')
    .replace(/[\u0300-\u036f]/g, '');

  let slug = mapped.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // A leading "3-" would read as an ordering prefix, so "3 Sum" becomes "3sum".
  slug = slug.replace(/^(\d+)-/, '$1');

  if (slug.length > MAX_LENGTH) {
    const cut = slug.slice(0, MAX_LENGTH);
    slug = cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut;
  }
  return slug;
}

function randomSuffix(length = 4): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** The slug for a new item, falling back to "<section>-<random>" when the title has no usable characters. */
export function baseNameFor(title: string, sectionName: string): string {
  return slugify(title) || `${slugify(sectionName) || 'item'}-${randomSuffix()}`;
}

/** First "<base>-N" (N from 2) that is not taken. */
export function numberedAlternative(base: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const DUPLICATE_NAME_MESSAGE = 'A file with this name already exists';

export type FileNameCheck =
  { ok: true; name: string } | { ok: false; name: string; message: string; alternative: string };

/**
 * Checks a proposed name (without extension) against the names already in the
 * folder (also without extensions, so "intro.md" blocks "intro.html").
 */
export function checkFileName(name: string, taken: ReadonlySet<string>): FileNameCheck {
  if (!taken.has(name)) return { ok: true, name };
  return {
    ok: false,
    name,
    message: DUPLICATE_NAME_MESSAGE,
    alternative: numberedAlternative(name, taken),
  };
}

/** "big-o-notation" -> "Big o notation". Used only when a file carries no title of its own. */
export function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function stem(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
