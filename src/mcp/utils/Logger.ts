/**
 * stderr-only logger for the MCP server.
 *
 * stdout is reserved for MCP JSON-RPC protocol traffic.
 * All diagnostic/debug output MUST go to stderr.
 */

import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand.js';

export function log(message: string): void {
  process.stderr.write(`[${PUBLIC_BRAND_NAME}-mcp] ${message}\n`);
}
