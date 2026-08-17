import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../../src/mcp/utils/Logger';

describe('MCP diagnostic branding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the public brand in stderr diagnostics', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    log('ready');

    expect(write).toHaveBeenCalledWith('[MarkuprPlus-mcp] ready\n');
  });
});
