import { close, createStaticServer, listen } from '../../scripts/static-server';

/**
 * Serves out/ on 4400 and artifacts-out/ on 4401 from the test runner's own
 * process (Playwright's webServer kill is very slow on Windows), and closes
 * both, keep-alive connections included, when the run ends.
 */
export default async function globalSetup() {
  const site = createStaticServer('out');
  const artifacts = createStaticServer('artifacts-out');
  await listen(site, 4400);
  await listen(artifacts, 4401);
  return async () => {
    await Promise.all([close(site), close(artifacts)]);
  };
}
