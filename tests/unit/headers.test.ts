import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addScriptPolicy,
  directive,
  headersFor,
  readHeaderRules,
  scopedHosts,
  scriptHash,
  sourceToRegExp,
  withDirective,
} from '../../scripts/headers';

const site = readHeaderRules('vercel.json');
const artifacts = readHeaderRules('artifacts-site/vercel.json');

describe('vercel.json (main site)', () => {
  const page = headersFor(site, '/learning-notes/dsa-python/arrays/two-sum');
  const csp = page['content-security-policy'] ?? '';

  it('sends the CSP from the spec on every page', () => {
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://api.github.com']);
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:', 'https:']);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    // Exactly one origin may be framed: the artifacts site.
    expect(directive(csp, 'frame-src')).toHaveLength(1);
    expect(directive(csp, 'frame-src')[0]).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    // Pagefind runs WebAssembly; inline scripts are pinned per page (addScriptPolicy).
    expect(directive(csp, 'script-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
    ]);
    // CodeMirror and next-themes mount <style> elements; scripts stay pinned.
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(page['x-content-type-options']).toBe('nosniff');
    expect(page['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('caches HTML for no time and hashed assets and Pagefind for a year', () => {
    const fresh = 'public, max-age=0, must-revalidate';
    const year = 'public, max-age=31536000, immutable';
    for (const path of ['/', '/learning-notes', '/admin/login', '/tracks.css', '/index.txt'])
      expect(headersFor(site, path)['cache-control']).toBe(fresh);
    for (const path of [
      '/_next/static/chunks/a1b2.js',
      '/pagefind/pagefind.js',
      '/pagefind/index/en_1.pf_index',
    ])
      expect(headersFor(site, path)['cache-control']).toBe(year);
    // The security headers apply to assets too.
    expect(headersFor(site, '/_next/static/x.js')['x-content-type-options']).toBe('nosniff');
  });
});

describe('vercel.json (artifacts site)', () => {
  const artifactHeaders = (headers: Record<string, string>) => {
    expect(headers['content-security-policy']).toBe('sandbox allow-scripts');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    // The main site must be able to frame it.
    expect(headers['x-frame-options']).toBeUndefined();
  };

  it('sandboxes every artifact, even when opened directly, and never caches it', () => {
    artifactHeaders(headersFor(artifacts, '/learning-notes/dsa-python/arrays/viz.html'));
  });

  it('gives the artifacts host the same headers when it builds from the repository root', () => {
    // The artifacts project can share the root vercel.json: its host must never get
    // the site's CSP, whose frame-ancestors 'none' would stop every frame.
    const frameSrc = directive(
      headersFor(site, '/')['content-security-policy'] ?? '',
      'frame-src',
    )[0] as string;
    const host = new URL(frameSrc).host;
    expect(scopedHosts(site)).toEqual([host]);
    // cleanUrls serves /a/b.html at /a/b, so both addresses are covered.
    for (const path of ['/learning-notes/t/c/viz.html', '/learning-notes/t/c/viz'])
      artifactHeaders(headersFor(site, path, host));
    // Every other host gets the site's own headers.
    expect(
      headersFor(site, '/', 'dev-journal-theta.vercel.app')['content-security-policy'],
    ).toContain("frame-ancestors 'none'");
  });

  it('builds into a folder of its own inside the project root', () => {
    const config = JSON.parse(fs.readFileSync('artifacts-site/vercel.json', 'utf8')) as {
      buildCommand: string;
      outputDirectory: string;
    };
    expect(config.buildCommand).toContain('pnpm build:artifacts');
    expect(config.buildCommand).toContain(`artifacts-site/${config.outputDirectory}`);
  });
});

describe('header rules', () => {
  it('reads sources as path-to-regexp does: literal text, regex groups', () => {
    expect(sourceToRegExp('/(.*)').test('/anything/at/all')).toBe(true);
    expect(sourceToRegExp('/_next/static/(.*)').test('/_next/static/x.js')).toBe(true);
    expect(sourceToRegExp('/_next/static/(.*)').test('/_nextXstatic/x.js')).toBe(false);
    const rest = sourceToRegExp('/((?!_next/static/|pagefind/).*)');
    expect(rest.test('/learning-notes')).toBe(true);
    expect(rest.test('/_next/static/x.js')).toBe(false);
    expect(rest.test('/pagefind/pagefind.js')).toBe(false);
    expect(rest.test('/pagefinder')).toBe(true);
  });

  it('lets a later rule win for the same header', () => {
    const rules = [
      { source: '/(.*)', headers: [{ key: 'Cache-Control', value: 'a' }] },
      { source: '/x/(.*)', headers: [{ key: 'cache-control', value: 'b' }] },
    ];
    expect(headersFor(rules, '/x/y')).toEqual({ 'cache-control': 'b' });
    expect(headersFor(rules, '/y')).toEqual({ 'cache-control': 'a' });
  });

  it('replaces one directive of a policy', () => {
    const csp = "default-src 'self'; frame-src https://a.example; object-src 'none'";
    expect(withDirective(csp, 'frame-src', ['http://127.0.0.1:4401'])).toBe(
      "default-src 'self'; frame-src http://127.0.0.1:4401; object-src 'none'",
    );
  });
});

describe('per-page script policy', () => {
  const html =
    '<!DOCTYPE html><html><head><meta charSet="utf-8"/><meta name="viewport" content="x"/>' +
    '<script src="/_next/static/a.js" async=""></script></head><body>' +
    '<script>(()=>{let i=document.documentElement})()</script>' +
    '<script id="_R_">self.__next_f=[]</script>' +
    '<script type="application/ld+json">{"a":1}</script>' +
    '<script>(()=>{let i=document.documentElement})()</script></body></html>';

  it('pins exactly the inline scripts of the page, right after <meta charset>', () => {
    const out = addScriptPolicy(html);
    const sha = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;
    expect(scriptHash('self.__next_f=[]')).toBe(sha('self.__next_f=[]'));
    expect(out).toContain(
      `<meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval' ${[
        sha('(()=>{let i=document.documentElement})()'),
        sha('self.__next_f=[]'),
        sha('{"a":1}'),
      ].join(' ')}"/><meta name="viewport"`,
    );
    // External scripts are allowed by 'self', not hashed; the rest of the page is untouched.
    expect(out.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')).toBe(html);
  });

  it('replaces its own policy when run again', () => {
    const once = addScriptPolicy(html);
    expect(addScriptPolicy(once)).toBe(once);
    expect(once.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
  });

  it('falls back to <head> and leaves documents without one alone', () => {
    expect(addScriptPolicy('<html><head><title>x</title></head></html>')).toMatch(
      /^<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval'"\/><title>/,
    );
    expect(addScriptPolicy('<p>fragment</p>')).toBe('<p>fragment</p>');
  });
});
