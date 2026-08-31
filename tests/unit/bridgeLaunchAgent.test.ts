import { describe, expect, it } from 'vitest';
import {
  planBridgeInstall,
  planBridgeUninstall,
  renderBridgeLaunchAgent,
} from '../../src/bridge/BridgeLaunchAgent';
import { resolveBridgePaths } from '../../src/bridge/BridgeConfig';

const paths = resolveBridgePaths('/Users/tester');

describe('CLI bridge LaunchAgent', () => {
  it('renders an escaped per-user launchd service with no token', () => {
    const plist = renderBridgeLaunchAgent({
      nodePath: '/opt/homebrew/bin/node',
      cliPath: '/Users/tester/CLI & Tools/dist/cli/index.mjs',
      paths,
    });

    expect(plist).toContain('<string>com.trieflow.markuprplus.cli-bridge</string>');
    expect(plist).toContain('<string>/opt/homebrew/bin/node</string>');
    expect(plist).toContain('<string>/Users/tester/CLI &amp; Tools/dist/cli/index.mjs</string>');
    expect(plist).toContain('<string>bridge</string>');
    expect(plist).toContain('<string>serve</string>');
    expect(plist).toContain('<key>RunAtLoad</key>');
    expect(plist).toContain('<key>KeepAlive</key>');
    expect(plist).not.toContain('Bearer');
    expect(plist).not.toContain('token');
  });

  it('plans idempotent bootout/bootstrap commands in the current GUI domain', () => {
    expect(planBridgeInstall({
      platform: 'darwin',
      uid: 501,
      nodePath: '/opt/homebrew/bin/node',
      cliPath: '/opt/homebrew/lib/node_modules/markuprx/dist/cli/index.mjs',
      paths,
    })).toMatchObject({
      plistPath: paths.launchAgentPath,
      bootoutArgs: ['bootout', 'gui/501/com.trieflow.markuprplus.cli-bridge'],
      bootstrapArgs: ['bootstrap', 'gui/501', paths.launchAgentPath],
      kickstartArgs: ['kickstart', '-k', 'gui/501/com.trieflow.markuprplus.cli-bridge'],
    });
  });

  it('rejects unsupported platforms, relative executables, and npx caches', () => {
    expect(() => planBridgeInstall({
      platform: 'linux', uid: 501, nodePath: '/usr/bin/node', cliPath: '/opt/markuprx/index.mjs', paths,
    })).toThrow(/macOS/i);
    expect(() => planBridgeInstall({
      platform: 'darwin', uid: 501, nodePath: 'node', cliPath: '/opt/markuprx/index.mjs', paths,
    })).toThrow(/absolute/i);
    expect(() => planBridgeInstall({
      platform: 'darwin',
      uid: 501,
      nodePath: '/usr/bin/node',
      cliPath: '/Users/tester/.npm/_npx/abc/node_modules/markuprx/dist/cli/index.mjs',
      paths,
    })).toThrow(/temporary npx cache/i);
  });

  it('limits uninstall to the exact bridge-owned plist and config files', () => {
    expect(planBridgeUninstall({ platform: 'darwin', uid: 501, paths })).toEqual({
      bootoutArgs: ['bootout', 'gui/501/com.trieflow.markuprplus.cli-bridge'],
      filesToRemove: [paths.launchAgentPath, paths.configPath],
    });
  });
});
