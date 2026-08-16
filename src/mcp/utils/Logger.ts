/**
 * stderr-only logger for the MCP server.
 *
 * stdout is reserved for MCP JSON-RPC protocol traffic.
 * All diagnostic/debug output MUST go to stderr.
 */

export function log(message: string): void {
  process.stderr.write(`[MarkuprX-mcp] ${message}\n`);
}
