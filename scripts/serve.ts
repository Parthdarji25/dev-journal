/**
 * pnpm start: serves the exported site.
 * Usage: tsx scripts/serve.ts [dir=out] [port=3000]
 */
import { createStaticServer, listen } from './static-server';

const dir = process.argv[2] ?? 'out';
const port = Number(process.argv[3] ?? process.env.PORT ?? 3000);

await listen(createStaticServer(dir), port);
console.log(`Serving ${dir} at http://127.0.0.1:${port}`);
