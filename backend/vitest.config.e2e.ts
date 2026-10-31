import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-jwt-secret.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
