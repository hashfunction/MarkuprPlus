import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { generateBridgeToken } from './BridgeAuth';
import {
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_PROTOCOL_VERSION,
} from '../shared/cliBridgeProtocol';

export const CLI_BRIDGE_LAUNCH_AGENT_LABEL = 'com.trieflow.markuprplus.cli-bridge';

export interface BridgePaths {
  stateDirectory: string;
  configPath: string;
  stdoutLogPath: string;
  stderrLogPath: string;
  launchAgentPath: string;
}

export interface BridgeConfig {
  token: string;
  protocolVersion: number;
  port: number;
}

export function resolveBridgePaths(
  homeDirectory: string,
  stateDirectoryOverride?: string,
): BridgePaths {
  const stateDirectory = stateDirectoryOverride
    ? stateDirectoryOverride
    : join(homeDirectory, '.config', 'markuprplus', 'bridge');
  return {
    stateDirectory,
    configPath: join(stateDirectory, 'config.json'),
    stdoutLogPath: join(stateDirectory, 'stdout.log'),
    stderrLogPath: join(stateDirectory, 'stderr.log'),
    launchAgentPath: join(
      homeDirectory,
      'Library',
      'LaunchAgents',
      `${CLI_BRIDGE_LAUNCH_AGENT_LABEL}.plist`,
    ),
  };
}

function validateBridgeConfig(value: unknown): BridgeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid CLI bridge configuration.');
  }
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).sort().join(',') !== 'port,protocolVersion,token'
    || typeof object.token !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(object.token)
    || Buffer.from(object.token, 'base64url').length !== 32
    || object.protocolVersion !== CLI_BRIDGE_PROTOCOL_VERSION
    || object.port !== CLI_BRIDGE_DEFAULT_PORT
  ) {
    throw new Error('Invalid CLI bridge configuration.');
  }
  return {
    token: object.token,
    protocolVersion: object.protocolVersion,
    port: object.port,
  };
}

async function ensureRegularFile(path: string): Promise<void> {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error('Invalid CLI bridge configuration file.');
  }
}

async function writeConfigAtomically(paths: BridgePaths, config: BridgeConfig): Promise<void> {
  await mkdir(paths.stateDirectory, { recursive: true, mode: 0o700 });
  await chmod(paths.stateDirectory, 0o700);
  const temporaryPath = join(paths.stateDirectory, `.config-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, paths.configPath);
    await chmod(paths.configPath, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export async function readBridgeConfig(paths: BridgePaths): Promise<BridgeConfig> {
  try {
    await ensureRegularFile(paths.configPath);
    const raw = await readFile(paths.configPath, 'utf8');
    return validateBridgeConfig(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid CLI bridge configuration.');
    }
    throw error;
  }
}

export async function loadOrCreateBridgeConfig(
  paths: BridgePaths,
  dependencies: { generateToken?: () => string } = {},
): Promise<{ config: BridgeConfig; created: boolean }> {
  try {
    return { config: await readBridgeConfig(paths), created: false };
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  const config: BridgeConfig = {
    token: (dependencies.generateToken || generateBridgeToken)(),
    protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
    port: CLI_BRIDGE_DEFAULT_PORT,
  };
  validateBridgeConfig(config);
  await writeConfigAtomically(paths, config);
  return { config, created: true };
}

export async function rotateBridgeToken(
  paths: BridgePaths,
  generateToken: () => string = generateBridgeToken,
): Promise<BridgeConfig> {
  const existing = await readBridgeConfig(paths);
  const next = { ...existing, token: generateToken() };
  validateBridgeConfig(next);
  await writeConfigAtomically(paths, next);
  return next;
}
