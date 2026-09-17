import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureMcpClient } from '../../src/cli/McpIntegration';

describe('MCP client integration setup', () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'markuprplus-integrations-')); });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });
  const runtime = () => ({
    homeDirectory: home,
    platform: 'darwin' as const,
    nodePath: '/tools/Node Runtime/node',
    serverPath: '/tools/MarkuprPlus/dist/mcp/index.mjs',
    env: { PATH: '/tools:/usr/bin' },
  });

  it('merges Copilot config, preserves other servers and makes an exact backup', async () => {
    const path = join(home, '.copilot', 'mcp-config.json');
    await mkdir(join(home, '.copilot'));
    const original = JSON.stringify({ mcpServers: { existing: { command: 'keep' } }, custom: true });
    await writeFile(path, original);
    const result = await configureMcpClient('copilot', runtime());
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      custom: true,
      mcpServers: {
        existing: { command: 'keep' },
        markuprplus: {
          type: 'local',
          command: '/tools/Node Runtime/node',
          args: ['/tools/MarkuprPlus/dist/mcp/index.mjs'],
          tools: ['*'],
          env: { PATH: expect.stringContaining('/tools/Node Runtime') },
        },
      },
    });
    expect(await readFile(result.backupPaths[0], 'utf8')).toBe(original);
    const repeated = await configureMcpClient('copilot', runtime());
    expect(repeated.changed).toBe(false);
    expect(repeated.backupPaths).toEqual([]);
  });

  it('respects COPILOT_HOME and previews without creating files', async () => {
    const custom = join(home, 'custom-copilot');
    const options = { ...runtime(), env: { COPILOT_HOME: custom }, dryRun: true };
    const result = await configureMcpClient('copilot', options);
    expect(result.paths).toEqual([join(custom, 'mcp-config.json')]);
    expect(result.preview).toContain('markuprplus');
    expect(await readdir(home)).toEqual([]);
  });

  it('configures both the Chat and Code tabs of the Claude Mac app', async () => {
    await configureMcpClient('claude-desktop', runtime());
    for (const path of [
      join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      join(home, '.claude.json'),
    ]) {
      expect(JSON.parse(await readFile(path, 'utf8')).mcpServers.markuprplus).toMatchObject({
        command: '/tools/Node Runtime/node', args: ['/tools/MarkuprPlus/dist/mcp/index.mjs'],
      });
    }
  });

  it('validates all Claude configurations before changing either one', async () => {
    await writeFile(join(home, '.claude.json'), 'malformed');
    await expect(configureMcpClient('claude-desktop', runtime())).rejects.toThrow('Invalid JSON');
    expect(await readdir(home)).toEqual(['.claude.json']);
  });

  it.each(['null', '[]', '{"mcpServers":[]}', '{"mcpServers":null}'])('rejects malformed config shape %s', async (input) => {
    await mkdir(join(home, '.copilot'));
    const path = join(home, '.copilot', 'mcp-config.json');
    await writeFile(path, input);
    await expect(configureMcpClient('copilot', runtime())).rejects.toThrow('configuration');
    expect(await readFile(path, 'utf8')).toBe(input);
  });

  it('requires force to replace a conflicting server and retains a backup', async () => {
    await mkdir(join(home, '.copilot'));
    const path = join(home, '.copilot', 'mcp-config.json');
    const original = '{"mcpServers":{"markuprplus":{"command":"custom"}}}';
    await writeFile(path, original);
    await expect(configureMcpClient('copilot', runtime())).rejects.toThrow('--force');
    expect(await readFile(path, 'utf8')).toBe(original);
    const result = await configureMcpClient('copilot', { ...runtime(), force: true });
    expect(result.changed).toBe(true);
    expect(await readFile(result.backupPaths[0], 'utf8')).toBe(original);
  });

  it('previews Codex registration without requiring the CLI or changing config', async () => {
    const result = await configureMcpClient('codex', { ...runtime(), dryRun: true });
    expect(result.paths).toEqual([join(home, '.codex', 'config.toml')]);
    expect(result.preview).toContain('[mcp_servers.markuprplus]');
    expect(await readdir(home)).toEqual([]);
  });

  it('uses Codex’s own config writer with the intended CODEX_HOME, without requiring login', async () => {
    const codexHome = join(home, 'custom-codex');
    await mkdir(codexHome);
    const original = '# Preserve this comment\nmodel = "custom-model"\n';
    await writeFile(join(codexHome, 'config.toml'), original);
    const calls: string[][] = [];
    const result = await configureMcpClient('codex', {
      ...runtime(), env: { CODEX_HOME: codexHome },
      findCodex: async () => '/Applications/Codex.app/Contents/Resources/codex',
      run: async (options) => {
        expect(options.executable).toBe('/Applications/Codex.app/Contents/Resources/codex');
        expect(options.env?.CODEX_HOME).toBe(codexHome);
        calls.push(options.args);
        return { exitCode: 0, stdout: options.args[1] === 'list' ? '[]' : '', stderr: '', timedOut: false, truncated: false };
      },
    });
    expect(calls[1]).toEqual(expect.arrayContaining([
      'mcp', 'add', 'markuprplus', '--env', '--',
      '/tools/Node Runtime/node', '/tools/MarkuprPlus/dist/mcp/index.mjs',
    ]));
    expect(await readFile(result.backupPaths[0], 'utf8')).toBe(original);
  });

  it.each([
    { exitCode: 1, stdout: '', stderr: 'Invalid TOML', timedOut: false, truncated: false },
    { exitCode: 0, stdout: 'not json', stderr: '', timedOut: false, truncated: false },
    { exitCode: 0, stdout: '{}', stderr: '', timedOut: false, truncated: false },
  ])('leaves Codex config alone when inspection fails: %j', async (response) => {
    await mkdir(join(home, '.codex'));
    const original = 'preserve this config';
    const path = join(home, '.codex', 'config.toml');
    await writeFile(path, original);
    const calls: string[][] = [];
    await expect(configureMcpClient('codex', {
      ...runtime(), findCodex: async () => '/tools/codex',
      run: async ({ args }) => { calls.push(args); return response; },
    })).rejects.toThrow('configuration');
    expect(calls).toEqual([['mcp', 'list', '--json']]);
    expect(await readFile(path, 'utf8')).toBe(original);
    expect(await readdir(join(home, '.codex'))).toEqual(['config.toml']);
  });

  it('reports an unavailable Codex CLI without modifying configuration', async () => {
    await expect(configureMcpClient('codex', {
      ...runtime(), findCodex: async () => null,
    })).rejects.toThrow('Install Codex');
    expect(await readdir(home)).toEqual([]);
  });
});
