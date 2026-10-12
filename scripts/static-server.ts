/**
 * Static file server for the exported site, used by scripts/serve.ts
 * (pnpm start) and by the e2e global setup. Clean URLs: /a/b serves a/b.html
 * or a/b/index.html; misses serve 404.html with status 404.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

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

export function createStaticServer(dirArg: string): http.Server {
  const dir = path.resolve(dirArg);

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
    res.writeHead(status, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
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
