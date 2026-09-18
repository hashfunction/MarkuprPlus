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
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/main/**', 'src/shared/**', 'src/cli/**', 'src/mcp/**', 'src/bridge/**'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '.worktrees/**',
        'coverage/**',
        '**/*.d.ts',
        '**/types.ts',
        '**/*.config.ts',
        '**/index.ts', // Re-exports
        'src/main/platform/**', // Platform-specific, tested in Electron UI
        'src/main/windows/**', // Window management, tested in Electron UI
        'src/main/AutoUpdater.ts', // Electron auto-updater, untestable in Node
      ],
      thresholds: {
        lines: 79,
        functions: 73,
        branches: 78,
        statements: 79,
      },
    },
    // Test timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    // Watch mode settings
    watchExclude: ['node_modules/**', 'dist/**'],
    // Reporter
    reporters: ['default'],
    // Pool settings for better isolation.
    // singleFork must stay off: it shares one module registry across every test
    // file, so a vi.mock() in one file leaks into the ones that run after it.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
