import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MANIFEST_DISK_PATH =
  process.env.DEEPBOOK_SANDBOX_DEPLOYMENTS ??
  join(homedir(), 'workspace/deepbook-sandbox/sandbox/deployments/localnet.json');

const manifestMiddleware = {
  name: 'manifest-middleware',
  configureServer(server: any) {
    server.middlewares.use('/localnet.json', async (_req: any, res: any) => {
      try {
        const content = await readFile(MANIFEST_DISK_PATH, 'utf8');
        res.setHeader('content-type', 'application/json'); res.statusCode = 200; res.end(content);
      } catch {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `localnet.json not found at ${MANIFEST_DISK_PATH}. Run pnpm deploy-all in deepbook-sandbox.` }));
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), manifestMiddleware],
  // proxy applies to `pnpm dev` only; vitest (node env) bypasses the dev server
  server: { proxy: { '/faucet': 'http://127.0.0.1:9009' } },
  test: { environment: 'node', globals: true, include: ['tests/**/*.{test,spec}.ts'], testTimeout: 120_000, hookTimeout: 120_000 },
});
