import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: './coverage',
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'configs/**/*.{ts,tsx}',
        'middleware.ts',
        'instrumentation.ts',
        'proxy.ts',
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'e2e/**',
        'eval/**',
        'packages/**',
        'scripts/**',
        'public/**',
        'drizzle/**',
        '.next/**',
        '**/*.config.{ts,tsx,js,mjs,cjs}',
        '**/*.d.ts',
      ],
    },
  },
});
