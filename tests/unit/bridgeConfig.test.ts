import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOrCreateBridgeConfig,
  readBridgeConfig,
  resolveBridgePaths,
  rotateBridgeToken,
} from '../../src/bridge/BridgeConfig';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CLI bridge configuration', () => {
  it('resolves only the current user bridge and LaunchAgent paths', () => {
    expect(resolveBridgePaths('/Users/example')).toEqual({
      stateDirectory: '/Users/example/.config/markuprplus/bridge',
      configPath: '/Users/example/.config/markuprplus/bridge/config.json',
      stdoutLogPath: '/Users/example/.config/markuprplus/bridge/stdout.log',
      stderrLogPath: '/Users/example/.config/markuprplus/bridge/stderr.log',
      launchAgentPath:
        '/Users/example/Library/LaunchAgents/com.trieflow.markuprplus.cli-bridge.plist',
    });
  });

  it('creates a mode-restricted config and retains its valid token', async () => {
    const home = await mkdtemp(join(tmpdir(), 'markuprplus-bridge-config-'));
    roots.push(home);
    const paths = resolveBridgePaths(home);
    const first = await loadOrCreateBridgeConfig(paths, {
      generateToken: () => 'c'.repeat(43),
    });
    const second = await loadOrCreateBridgeConfig(paths, {
      generateToken: () => 'd'.repeat(43),
    });

    expect(first).toEqual({
      config: { token: 'c'.repeat(43), protocolVersion: 1, port: 49_647 },
      created: true,
    });
    expect(second).toEqual({ config: first.config, created: false });
    expect((await stat(paths.stateDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.configPath)).mode & 0o777).toBe(0o600);
  });

  it('rejects malformed configuration instead of silently replacing it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'markuprplus-bridge-config-'));
    roots.push(home);
    const paths = resolveBridgePaths(home);
    await loadOrCreateBridgeConfig(paths, { generateToken: () => 'e'.repeat(43) });
    await writeFile(paths.configPath, '{"token":"short"}\n', { mode: 0o600 });

    await expect(readBridgeConfig(paths)).rejects.toThrow(/invalid CLI bridge configuration/i);
    await expect(loadOrCreateBridgeConfig(paths)).rejects.toThrow(/invalid CLI bridge configuration/i);
    expect(await readFile(paths.configPath, 'utf8')).toBe('{"token":"short"}\n');
  });

  it('rotates only the token while preserving protocol and port', async () => {
    const home = await mkdtemp(join(tmpdir(), 'markuprplus-bridge-config-'));
    roots.push(home);
    const paths = resolveBridgePaths(home);
    await loadOrCreateBridgeConfig(paths, { generateToken: () => 'f'.repeat(43) });

    const rotated = await rotateBridgeToken(paths, () => 'g'.repeat(43));
    expect(rotated).toEqual({ token: 'g'.repeat(43), protocolVersion: 1, port: 49_647 });
    await expect(readBridgeConfig(paths)).resolves.toEqual(rotated);
    expect((await stat(paths.configPath)).mode & 0o777).toBe(0o600);
  });
});
