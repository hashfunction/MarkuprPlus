/**
 * MarkuprX MCP Server — Entry Point
 *
 * Headless Node.js process communicating over stdio using JSON-RPC 2.0.
 * stdout is reserved for MCP protocol — all logging goes to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { log } from './utils/Logger.js';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand.js';

// Read version from package.json at build time (injected by esbuild)
declare const __MARKUPRX_VERSION__: string;
const VERSION =
  typeof __MARKUPRX_VERSION__ !== 'undefined' ? __MARKUPRX_VERSION__ : '0.0.0-dev';

log(`${PUBLIC_BRAND_NAME} MCP server v${VERSION} starting...`);

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});

try {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  log(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
