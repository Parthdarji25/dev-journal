/**
 * pnpm start: serves the exported site with the headers from its vercel.json
 * (the folder's own, else the repository's).
 * Usage: tsx scripts/serve.ts [dir=out] [port=3000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readHeaderRules } from './headers';
import { createStaticServer, listen } from './static-server';

const dir = process.argv[2] ?? 'out';
const port = Number(process.argv[3] ?? process.env.PORT ?? 3000);
const own = path.join(dir, 'vercel.json');

await listen(
  createStaticServer(dir, {
    headers: readHeaderRules(fs.existsSync(own) ? own : 'vercel.json'),
    frameSrc: process.env.NEXT_PUBLIC_ARTIFACTS_ORIGIN || undefined,
  }),
  port,
);
console.log(`Serving ${dir} at http://127.0.0.1:${port}`);
