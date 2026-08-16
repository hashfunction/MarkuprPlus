#!/usr/bin/env node

/**
 * build-mcp.mjs - Build the markuprx MCP server bundle
 *
 * Uses esbuild to bundle src/mcp/index.ts into a single ESM file at
 * dist/mcp/index.mjs. Node built-ins and select npm packages are kept
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

console.log(`[build-mcp] Building markuprx MCP server v${pkg.version}...`);

try {
  await build({
    entryPoints: [join(repoRoot, 'src/mcp/index.ts')],
    outfile: join(repoRoot, 'dist/mcp/index.mjs'),
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

    // Keep all node_modules external. The MCP server relies on npm-installed
    // dependencies at runtime (@modelcontextprotocol/sdk, sharp, etc.)
    packages: 'external',

    // Add shebang banner for direct execution
    banner: {
      js: '#!/usr/bin/env node',
    },
  });

  // Make the output executable
  const outputPath = join(repoRoot, 'dist/mcp/index.mjs');
  chmodSync(outputPath, 0o755);

  console.log(`[build-mcp] Built successfully: dist/mcp/index.mjs`);
} catch (error) {
  console.error(`[build-mcp] Build failed:`, error);
  process.exit(1);
}
