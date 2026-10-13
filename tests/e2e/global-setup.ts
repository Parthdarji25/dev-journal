import { readHeaderRules } from '../../scripts/headers';
import { close, createStaticServer, listen } from '../../scripts/static-server';

const ARTIFACTS_ORIGIN = 'http://127.0.0.1:4401';

/**
 * Serves out/ on 4400 and artifacts-out/ on 4401 from the test runner's own
 * process (Playwright's webServer kill is very slow on Windows), and closes
 * both, keep-alive connections included, when the run ends. Both send the
 * headers from their vercel.json, so every test runs under the production
 * CSP (frames allowed from the local artifacts server).
 */
export default async function globalSetup() {
  const site = createStaticServer('out', {
    headers: readHeaderRules('vercel.json'),
    frameSrc: ARTIFACTS_ORIGIN,
  });
  const artifacts = createStaticServer('artifacts-out', {
    headers: readHeaderRules('artifacts-out/vercel.json'),
  });
  await listen(site, 4400);
  await listen(artifacts, 4401);
  return async () => {
    await Promise.all([close(site), close(artifacts)]);
  };
}
