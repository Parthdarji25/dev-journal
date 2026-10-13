/**
 * Production headers, shared by the build (scripts/csp-hashes.ts), the local
 * servers (pnpm start, e2e, Lighthouse) and the tests: vercel.json header
 * rules matched the way Vercel matches them, and the per-page policy that lets
 * only a page's own inline scripts run.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

/** A `has` / `missing` condition; only `host` is used in this project. */
interface HostCondition {
  type: 'host';
  value: string;
}

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
  has?: HostCondition[];
  missing?: HostCondition[];
}

/** The header rules of a vercel.json (none when the file is missing). */
export function readHeaderRules(file: string): HeaderRule[] {
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { headers?: HeaderRule[] }).headers ?? [];
}

/**
 * A vercel.json `source` as a RegExp, as path-to-regexp reads it: text is
 * literal and (...) groups are regular expressions. Named parameters (:slug)
 * are not used in this project and not supported here.
 */
export function sourceToRegExp(source: string): RegExp {
  let pattern = '';
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '(') {
      pattern += (source[i] as string).replace(/[.*+?^${}|[\]\\]/g, '\\$&');
      continue;
    }
    let depth = 0;
    let end = i;
    for (; end < source.length; end++) {
      if (source[end] === '\\') end++;
      else if (source[end] === '(') depth++;
      else if (source[end] === ')' && --depth === 0) break;
    }
    pattern += source.slice(i, end + 1);
    i = end;
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * The headers sent for `pathname` on `host` (without a port); for the same
 * header, a later rule wins. Rules with `has` apply only on those hosts, and
 * rules with `missing` everywhere else.
 */
export function headersFor(
  rules: HeaderRule[],
  pathname: string,
  host = '',
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of rules) {
    if (!sourceToRegExp(rule.source).test(pathname)) continue;
    if (rule.has && !rule.has.every((c) => c.value === host)) continue;
    if (rule.missing?.some((c) => c.value === host)) continue;
    for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
  }
  return headers;
}

/** The hosts that get their own rules (the artifacts site, when it shares this vercel.json). */
export function scopedHosts(rules: HeaderRule[]): string[] {
  return [...new Set(rules.flatMap((r) => (r.has ?? []).map((c) => c.value)))];
}

/** The sources one directive of a policy allows. */
export function directive(policy: string, name: string): string[] {
  for (const part of policy.split(';')) {
    const [key, ...sources] = part.trim().split(/\s+/);
    if (key === name) return sources;
  }
  return [];
}

/** `policy` with the sources of one directive replaced. */
export function withDirective(policy: string, name: string, sources: string[]): string {
  return policy
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.split(/\s+/)[0] === name ? [name, ...sources].join(' ') : part))
    .join('; ');
}

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const PAGE_POLICY = /<meta http-equiv="Content-Security-Policy"[^>]*>/gi;

/** The CSP source for exactly this inline script. */
export function scriptHash(code: string): string {
  return `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`;
}

/**
 * Adds the page's own script policy right after <meta charset>: same-origin
 * scripts, WebAssembly (Pagefind) and, by hash, exactly the inline scripts of
 * this page. Browsers enforce it together with the vercel.json header, so an
 * inline script runs only when it is one of these. Running it again replaces
 * the policy it added before.
 */
export function addScriptPolicy(html: string): string {
  const page = html.replace(PAGE_POLICY, '');
  const hashes = new Set([...page.matchAll(INLINE_SCRIPT)].map((m) => scriptHash(m[1] ?? '')));
  const policy = ["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(' ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  const anchor = /<meta charset="?utf-8"?\s*\/?>/i.exec(page) ?? /<head[^>]*>/i.exec(page);
  if (!anchor) return page;
  const at = anchor.index + anchor[0].length;
  return `${page.slice(0, at)}${meta}${page.slice(at)}`;
}
