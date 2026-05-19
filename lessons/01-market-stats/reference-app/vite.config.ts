/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Vite middleware serves `/localnet.json` from the deepbook-sandbox checkout.
// Sandbox location: ACC_PATHS_SANDBOX (injected by ACC at workspace seed),
// falling back to ~/workspace/deepbook-sandbox for standalone runs. The empty-
// string check guards against env-var-as-empty-string from a misconfigured caller.
const sandboxEnv = process.env.ACC_PATHS_SANDBOX;
const sandboxPath =
  sandboxEnv && sandboxEnv.length > 0
    ? sandboxEnv
    : path.join(homedir(), 'workspace', 'deepbook-sandbox');
const MANIFEST_DISK_PATH = path.join(
  sandboxPath,
  'sandbox',
  'deployments',
  'localnet.json',
);

// configureServer is a Vite Plugin hook, NOT a `server: ServerOptions` field.
// Placing it under `server: {}` causes Vite to silently drop the middleware
// and serve the SPA shell on /localnet.json.
const manifestMiddlewarePlugin = {
  name: 'manifest-middleware',
  configureServer(server: { middlewares: { use: (path: string, fn: (req: unknown, res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (s: string) => void }) => void) => void } }) {
    server.middlewares.use('/localnet.json', async (_req, res) => {
      try {
        const content = await fs.readFile(MANIFEST_DISK_PATH, 'utf8');
        res.setHeader('content-type', 'application/json');
        res.statusCode = 200;
        res.end(content);
      } catch {
        const msg = JSON.stringify({
          error: `localnet.json not found at ${MANIFEST_DISK_PATH}. Sandbox path resolved from ACC_PATHS_SANDBOX (set by ACC) or the ~/workspace/deepbook-sandbox fallback. Run pnpm deploy-all from the deepbook-sandbox repo's sandbox/ subdir, or relocate via course_paths in ~/.acc/config.json.`,
        });
        res.setHeader('content-type', 'application/json');
        res.statusCode = 404;
        res.end(msg);
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), manifestMiddlewarePlugin],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
