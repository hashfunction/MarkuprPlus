#!/usr/bin/env node

/**
 * build-cli.mjs - Build the markuprx CLI bundle
 *
 * Uses esbuild to bundle src/cli/index.ts into a single ESM file at
 * dist/cli/index.mjs. Node built-ins and select npm packages are kept
 * external so the bundle stays lean and compatible.
 */

import { build } from 'esbuild';
import { readFileSync, chmodSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));

console.log(`[build-cli] Building markuprx CLI v${pkg.version}...`);

try {
  await build({
    entryPoints: [join(repoRoot, 'src/cli/index.ts')],
    outfile: join(repoRoot, 'dist/cli/index.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    sourcemap: false,
    minify: false,

    // Inject version at build time
    define: {
      '__MARKUPRX_VERSION__': JSON.stringify(pkg.version),
    },

    // Keep all node_modules external. The CLI relies on npm-installed
    // dependencies at runtime (commander, whisper-node, etc.) so we
    // don't need to bundle them. This also avoids CJS/ESM interop
    // issues with packages like commander.
    packages: 'external',

    // Add shebang banner for CLI execution
    banner: {
      js: '#!/usr/bin/env node',
    },
  });

  // Make the output executable
  const outputPath = join(repoRoot, 'dist/cli/index.mjs');
  chmodSync(outputPath, 0o755);

  console.log(`[build-cli] Built successfully: dist/cli/index.mjs`);
} catch (error) {
  console.error(`[build-cli] Build failed:`, error);
  process.exit(1);
}
