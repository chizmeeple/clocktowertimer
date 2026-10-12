import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const workerRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: workerRoot,
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
      },
      // Shorter than the deployed default so the auth-timeout test can wait
      // for a real alarm without sitting for five seconds.
      miniflare: {
        bindings: {
          AUTH_TIMEOUT_MS: '250',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.js'],
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
