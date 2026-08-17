import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/types.ts',
        '**/*.config.ts',
        '**/index.ts', // Re-exports
      ],
      thresholds: {
        lines: 8,
        functions: 30,
        branches: 55,
        statements: 8,
      },
    },
    // Test timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    // Watch mode settings
    watchExclude: ['node_modules/**', 'dist/**'],
    // Reporter
    reporters: ['default'],
    // Pool settings for better isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
