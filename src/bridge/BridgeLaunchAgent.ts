import { spawn } from 'node:child_process';
import { lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import {
  CLI_BRIDGE_LAUNCH_AGENT_LABEL,
  type BridgePaths,
} from './BridgeConfig';

export interface BridgeLaunchAgentInput {
  platform: NodeJS.Platform;
  uid: number;
  nodePath: string;
  cliPath: string;
  paths: BridgePaths;
}

export interface BridgeInstallPlan {
  plistPath: string;
  plist: string;
  bootoutArgs: string[];
  bootstrapArgs: string[];
  kickstartArgs: string[];
}

export interface BridgeUninstallPlan {
  bootoutArgs: string[];
  filesToRemove: string[];
}

export interface LaunchctlResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type LaunchctlRunner = (args: string[]) => Promise<LaunchctlResult>;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function requireInstallInput(input: BridgeLaunchAgentInput): void {
  if (input.platform !== 'darwin') {
    throw new Error('MarkuprPlus CLI Bridge installation is supported only on macOS.');
  }
  if (!isAbsolute(input.nodePath) || !isAbsolute(input.cliPath)) {
    throw new Error('Bridge executable paths must be absolute.');
  }
  if (/(?:^|\/)\.npm\/_npx(?:\/|$)/.test(input.cliPath)) {
    throw new Error('Install markuprx globally before installing the bridge; a temporary npx cache is not stable.');
  }
}

export function renderBridgeLaunchAgent(
  input: Omit<BridgeLaunchAgentInput, 'platform' | 'uid'>,
): string {
  const values = [input.nodePath, input.cliPath, 'bridge', 'serve'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CLI_BRIDGE_LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${values.map((value) => `    <string>${escapeXml(value)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(input.paths.stdoutLogPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(input.paths.stderrLogPath)}</string>
</dict>
</plist>
`;
}

export function planBridgeInstall(input: BridgeLaunchAgentInput): BridgeInstallPlan {
  requireInstallInput(input);
  const service = `gui/${input.uid}/${CLI_BRIDGE_LAUNCH_AGENT_LABEL}`;
  return {
    plistPath: input.paths.launchAgentPath,
    plist: renderBridgeLaunchAgent(input),
    bootoutArgs: ['bootout', service],
    bootstrapArgs: ['bootstrap', `gui/${input.uid}`, input.paths.launchAgentPath],
    kickstartArgs: ['kickstart', '-k', service],
  };
}

export function planBridgeUninstall(
  input: Pick<BridgeLaunchAgentInput, 'platform' | 'uid' | 'paths'>,
): BridgeUninstallPlan {
  if (input.platform !== 'darwin') {
    throw new Error('MarkuprPlus CLI Bridge installation is supported only on macOS.');
  }
  return {
    bootoutArgs: ['bootout', `gui/${input.uid}/${CLI_BRIDGE_LAUNCH_AGENT_LABEL}`],
    filesToRemove: [input.paths.launchAgentPath, input.paths.configPath],
  };
}

export async function runLaunchctl(args: string[]): Promise<LaunchctlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/launchctl', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({
      exitCode,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

async function refuseSymlink(path: string): Promise<void> {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink()) {
      throw new Error(`Refusing to replace symbolic link: ${path}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

export async function installBridgeLaunchAgent(
  input: BridgeLaunchAgentInput,
  run: LaunchctlRunner = runLaunchctl,
): Promise<void> {
  const plan = planBridgeInstall(input);
  await mkdir(dirname(plan.plistPath), { recursive: true, mode: 0o700 });
  await refuseSymlink(plan.plistPath);
  await writeFile(plan.plistPath, plan.plist, { encoding: 'utf8', mode: 0o600 });
  await run(plan.bootoutArgs).catch(() => ({ exitCode: 1, stdout: '', stderr: '' }));
  const bootstrapped = await run(plan.bootstrapArgs);
  if (bootstrapped.exitCode !== 0) {
    throw new Error('Unable to bootstrap MarkuprPlus CLI Bridge.');
  }
}

export async function startBridgeLaunchAgent(
  input: BridgeLaunchAgentInput,
  run: LaunchctlRunner = runLaunchctl,
): Promise<void> {
  const plan = planBridgeInstall(input);
  const bootstrap = await run(plan.bootstrapArgs);
  if (bootstrap.exitCode !== 0) {
    const kickstart = await run(plan.kickstartArgs);
    if (kickstart.exitCode !== 0) {
      throw new Error('Unable to start MarkuprPlus CLI Bridge.');
    }
  }
}

export async function stopBridgeLaunchAgent(
  input: Pick<BridgeLaunchAgentInput, 'platform' | 'uid' | 'paths'>,
  run: LaunchctlRunner = runLaunchctl,
): Promise<void> {
  const result = await run(planBridgeUninstall(input).bootoutArgs);
  if (result.exitCode !== 0) {
    throw new Error('MarkuprPlus CLI Bridge is not running.');
  }
}

export async function bridgeLaunchAgentRunning(
  input: Pick<BridgeLaunchAgentInput, 'platform' | 'uid' | 'paths'>,
  run: LaunchctlRunner = runLaunchctl,
): Promise<boolean> {
  const service = `gui/${input.uid}/${CLI_BRIDGE_LAUNCH_AGENT_LABEL}`;
  return (await run(['print', service])).exitCode === 0;
}

export async function uninstallBridgeLaunchAgent(
  input: Pick<BridgeLaunchAgentInput, 'platform' | 'uid' | 'paths'>,
  run: LaunchctlRunner = runLaunchctl,
): Promise<void> {
  const plan = planBridgeUninstall(input);
  await run(plan.bootoutArgs).catch(() => ({ exitCode: 1, stdout: '', stderr: '' }));
  for (const path of plan.filesToRemove) {
    await refuseSymlink(path);
    await unlink(path).catch((error) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    });
  }
}
