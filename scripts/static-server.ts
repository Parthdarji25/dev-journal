/**
 * Static file server for the exported site, used by scripts/serve.ts
 * (pnpm start) and by the e2e global setup. Clean URLs: /a/b serves a/b.html
 * or a/b/index.html; misses serve 404.html with status 404. Text responses are
 * gzipped, as on the real host. HEAD requests (used by the Next.js router
 * before prefetching) get headers only. With vercel.json header rules it
 * sends the production headers too.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { headersFor, withDirective, type HeaderRule } from './headers';

export interface ServerOptions {
  /** vercel.json header rules, sent as the host would send them. */
  headers?: HeaderRule[];
  /** Replaces frame-src in the CSP (a local artifacts server instead of the production one). */
  frameSrc?: string;
}

const COMPRESSIBLE = /\.(html|js|css|json|txt|svg|xml|wasm)$/i;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

export function createStaticServer(dirArg: string, options: ServerOptions = {}): http.Server {
  const dir = path.resolve(dirArg);

  function hostHeaders(pathname: string): Record<string, string> {
    const headers = headersFor(options.headers ?? [], pathname);
    const csp = headers['content-security-policy'];
    if (csp && options.frameSrc) {
      headers['content-security-policy'] = withDirective(csp, 'frame-src', [options.frameSrc]);
    }
    return headers;
  }

  function resolveFile(urlPath: string): string | null {
    const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
    const base = path.join(dir, clean);
    if (!base.startsWith(dir)) return null;
    for (const candidate of [base, `${base}.html`, path.join(base, 'index.html')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = resolveFile(url.pathname);
    let status = 200;
    if (!file) {
      status = 404;
      file = resolveFile('/404.html');
    }
    if (!file) {
      res.writeHead(404).end('Not found');
      return;
    }
    const gzip =
      COMPRESSIBLE.test(file) && String(req.headers['accept-encoding'] ?? '').includes('gzip');
    res.writeHead(status, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      vary: 'accept-encoding',
      ...hostHeaders(url.pathname),
      ...(gzip ? { 'content-encoding': 'gzip' } : {}),
    });
    if (req.method === 'HEAD') res.end();
    else if (gzip) fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    else fs.createReadStream(file).pipe(res);
  });
}

export function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

/** Closes the server, including idle keep-alive connections from the browser. */
export function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
