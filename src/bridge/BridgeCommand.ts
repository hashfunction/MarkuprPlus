import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { startCliBridgeServer } from './CliBridgeServer';
import { createBridgeProviderRegistry } from './BridgeProviderRegistry';
import {
  loadOrCreateBridgeConfig,
  readBridgeConfig,
  resolveBridgePaths,
  rotateBridgeToken,
} from './BridgeConfig';
import {
  bridgeLaunchAgentRunning,
  installBridgeLaunchAgent,
  startBridgeLaunchAgent,
  stopBridgeLaunchAgent,
  uninstallBridgeLaunchAgent,
} from './BridgeLaunchAgent';

export interface BridgeStatus {
  installed: boolean;
  running: boolean;
  protocolVersion: number;
}

export interface BridgeLifecycle {
  install(): Promise<{ token: string; created: boolean }>;
  serve(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<BridgeStatus>;
  token(): Promise<string>;
  rotateToken(): Promise<string>;
  uninstall(): Promise<void>;
}

export interface BridgeCommandDependencies {
  lifecycle: BridgeLifecycle;
  write(line: string): void;
  writeError(line: string): void;
}

function runtimeInput() {
  const homeDirectory = homedir();
  const stateOverride = process.env.MARKUPRPLUS_BRIDGE_STATE_DIR?.trim() || undefined;
  const paths = resolveBridgePaths(homeDirectory, stateOverride);
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Unable to resolve the current macOS user.');
  return {
    paths,
    platform: process.platform,
    uid,
    nodePath: process.execPath,
    cliPath: resolve(process.argv[1]),
  };
}

export function createDefaultBridgeLifecycle(bridgeVersion: string): BridgeLifecycle {
  return {
    async install() {
      const input = runtimeInput();
      const { config, created } = await loadOrCreateBridgeConfig(input.paths);
      await installBridgeLaunchAgent(input);
      return { token: config.token, created };
    },
    async serve() {
      const input = runtimeInput();
      const { config } = await loadOrCreateBridgeConfig(input.paths);
      const handle = await startCliBridgeServer({
        token: config.token,
        bridgeVersion,
        registry: createBridgeProviderRegistry(),
        port: config.port,
      });
      await new Promise<void>((resolvePromise) => {
        const stop = () => {
          void handle.close().finally(resolvePromise);
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    },
    async start() {
      await startBridgeLaunchAgent(runtimeInput());
    },
    async stop() {
      const { platform, uid, paths } = runtimeInput();
      await stopBridgeLaunchAgent({ platform, uid, paths });
    },
    async status() {
      const { platform, uid, paths } = runtimeInput();
      let installed = true;
      try {
        await access(paths.launchAgentPath);
        await readBridgeConfig(paths);
      } catch {
        installed = false;
      }
      return {
        installed,
        running: installed
          ? await bridgeLaunchAgentRunning({ platform, uid, paths })
          : false,
        protocolVersion: 1,
      };
    },
    async token() {
      return (await readBridgeConfig(runtimeInput().paths)).token;
    },
    async rotateToken() {
      const input = runtimeInput();
      const config = await rotateBridgeToken(input.paths);
      await installBridgeLaunchAgent(input);
      return config.token;
    },
    async uninstall() {
      const { platform, uid, paths } = runtimeInput();
      await uninstallBridgeLaunchAgent({ platform, uid, paths });
    },
  };
}

function defaultDependencies(bridgeVersion: string): BridgeCommandDependencies {
  return {
    lifecycle: createDefaultBridgeLifecycle(bridgeVersion),
    write: (line) => console.log(line),
    writeError: (line) => console.error(line),
  };
}

export function registerBridgeCommand(
  program: Command,
  dependencies: Partial<BridgeCommandDependencies> & { bridgeVersion?: string } = {},
): void {
  const defaults = defaultDependencies(dependencies.bridgeVersion || '0.0.0-dev');
  const { lifecycle, write, writeError } = { ...defaults, ...dependencies };
  const action = (operation: () => Promise<void>) => async () => {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeError(message);
      process.exitCode = 1;
    }
  };
  const bridge = program.command('bridge').description('Manage the optional local CLI companion');

  bridge.command('install').description('Install and start the per-user companion').action(action(async () => {
    const result = await lifecycle.install();
    write('MarkuprPlus CLI Bridge installed.');
    if (result.created) {
      write(`Pairing token: ${result.token}`);
    } else {
      write('Pairing token retained. Run `markuprx bridge token` to display it.');
    }
  }));
  bridge.command('serve').description('Run the companion in the foreground').action(action(async () => {
    await lifecycle.serve();
  }));
  bridge.command('start').description('Start the installed companion').action(action(async () => {
    await lifecycle.start();
    write('MarkuprPlus CLI Bridge started.');
  }));
  bridge.command('stop').description('Stop the installed companion').action(action(async () => {
    await lifecycle.stop();
    write('MarkuprPlus CLI Bridge stopped.');
  }));
  bridge.command('status').description('Show companion status without secrets').action(action(async () => {
    const status = await lifecycle.status();
    write(`Installed: ${status.installed ? 'yes' : 'no'}`);
    write(`Running: ${status.running ? 'yes' : 'no'}`);
    write(`Protocol: ${status.protocolVersion}`);
  }));
  bridge.command('token').description('Print the pairing token').action(action(async () => {
    write(await lifecycle.token());
  }));
  bridge.command('rotate-token').description('Replace the pairing token and restart').action(action(async () => {
    write(`New pairing token: ${await lifecycle.rotateToken()}`);
  }));
  bridge.command('uninstall').description('Remove the per-user companion').action(action(async () => {
    await lifecycle.uninstall();
    write('MarkuprPlus CLI Bridge uninstalled.');
  }));
}
