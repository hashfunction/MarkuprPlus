import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Argument, type Command } from 'commander';
import { buildCliEnvironment, codexCliDiscovery } from '../main/ai/CodexCliDiscovery';
import { runCliProcess, type CliProcessOptions, type CliProcessResult } from '../main/ai/CliProcessRunner';

const CLIENTS = ['copilot', 'claude-desktop', 'claude-code', 'codex'] as const;
type McpClient = typeof CLIENTS[number];
type JsonObject = Record<string, unknown>;

export interface McpIntegrationOptions {
  homeDirectory: string;
  platform: NodeJS.Platform;
  nodePath: string;
  serverPath: string;
  env: NodeJS.ProcessEnv;
  dryRun?: boolean;
  force?: boolean;
  findCodex?: () => Promise<string | null>;
  run?: (options: CliProcessOptions) => Promise<CliProcessResult>;
}

export interface McpIntegrationResult {
  paths: string[];
  backupPaths: string[];
  changed: boolean;
  preview: string;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function backup(path: string, original: string | undefined): Promise<string[]> {
  if (original === undefined) return [];
  const backupPath = `${path}.markuprplus-${randomUUID()}.bak`;
  await writeFile(backupPath, original, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return [backupPath];
}

async function ensureUnchanged(path: string, original: string | undefined): Promise<void> {
  if (await readOptional(path) !== original) {
    throw new Error(`The configuration changed during setup: ${path}. Run the command again.`);
  }
}

export async function configureMcpClient(
  client: McpClient,
  options: McpIntegrationOptions,
): Promise<McpIntegrationResult> {
  if (!CLIENTS.includes(client)) throw new Error(`Unknown integration: ${client}`);
  if (!isAbsolute(options.nodePath) || !isAbsolute(options.serverPath)) {
    throw new Error('MCP setup requires absolute Node.js and server paths.');
  }
  const entry = {
    command: options.nodePath,
    args: [options.serverPath],
    env: { PATH: buildCliEnvironment(options.nodePath, options.env).PATH! },
  };
  const result: McpIntegrationResult = { paths: [], backupPaths: [], changed: false, preview: '' };

  if (client === 'codex') {
    const codexHome = resolve(options.env.CODEX_HOME?.trim() || join(options.homeDirectory, '.codex'));
    const path = join(codexHome, 'config.toml');
    result.paths = [path];
    result.preview = `[mcp_servers.markuprplus]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n\n[mcp_servers.markuprplus.env]\nPATH = ${JSON.stringify(entry.env.PATH)}\n`;
    if (options.dryRun) return result;

    const executable = await (options.findCodex ?? (async () => (
      (await codexCliDiscovery.discover(true)).executablePath ?? null
    )))();
    if (!executable) throw new Error('Install Codex CLI or the Codex Mac app, then run setup again.');
    const run = options.run ?? runCliProcess;
    const invoke = (args: string[]) => run({
      executable, args, env: { ...buildCliEnvironment(executable, options.env), CODEX_HOME: codexHome },
      timeoutMs: 10_000, maxOutputBytes: 64 * 1024,
    });
    const original = await readOptional(path);
    const existing = await invoke(['mcp', 'list', '--json']);
    if (existing.timedOut || existing.truncated || existing.exitCode !== 0) {
      throw new Error('Could not inspect Codex MCP configuration. No changes were made.');
    }
    let configurations: unknown;
    try { configurations = JSON.parse(existing.stdout); } catch {
      throw new Error('Codex returned invalid MCP configuration. No changes were made.');
    }
    if (!Array.isArray(configurations) || !configurations.every(isObject)) {
      throw new Error('Codex returned invalid MCP configuration. No changes were made.');
    }
    const config = configurations.find((candidate) => candidate.name === 'markuprplus');
    if (config) {
      const transport = isObject(config.transport) ? config.transport : undefined;
      if (transport && transport.type === 'stdio'
        && transport.command === entry.command
        && isDeepStrictEqual(transport.args, entry.args)
        && isObject(transport.env) && transport.env.PATH === entry.env.PATH) return result;
      if (!options.force) throw new Error(`markuprplus is already configured in ${path}. Use --force to replace it.`);
    }
    await ensureUnchanged(path, original);
    await mkdir(codexHome, { recursive: true });
    result.backupPaths = await backup(path, original);
    // Let Codex preserve TOML comments and unrelated settings with its own writer.
    const configured = await invoke([
      'mcp', 'add', 'markuprplus', '--env', `PATH=${entry.env.PATH}`,
      '--', entry.command, ...entry.args,
    ]);
    if (configured.exitCode !== 0 || configured.timedOut || configured.truncated) {
      throw new Error(`Codex MCP setup failed. Check ${path}.${result.backupPaths.length ? ` Backup: ${result.backupPaths[0]}` : ''}`);
    }
    result.changed = true;
    return result;
  }

  if (client === 'claude-desktop' && options.platform !== 'darwin') {
    throw new Error('The claude-desktop integration configures the Claude Mac app. Use claude-code on this platform.');
  }
  result.paths = client === 'copilot'
    ? [join(resolve(options.env.COPILOT_HOME?.trim() || join(options.homeDirectory, '.copilot')), 'mcp-config.json')]
    : client === 'claude-code'
      ? [join(options.homeDirectory, '.claude.json')]
      : [
          join(options.homeDirectory, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
          join(options.homeDirectory, '.claude.json'),
        ];
  const server = client === 'copilot' ? { type: 'local', ...entry, tools: ['*'] } : entry;
  result.preview = JSON.stringify({ mcpServers: { markuprplus: server } }, null, 2);

  // Prepare every file first so an invalid Code config cannot partially install Chat.
  const prepared = await Promise.all(result.paths.map(async (path) => {
    const original = await readOptional(path);
    let config: unknown;
    try { config = original === undefined ? {} : JSON.parse(original); } catch {
      throw new Error(`Invalid JSON in ${path}. Fix it before running setup.`);
    }
    if (!isObject(config) || ('mcpServers' in config && !isObject(config.mcpServers))) {
      throw new Error(`Invalid MCP configuration in ${path}: expected JSON objects.`);
    }
    const servers = (config.mcpServers ?? {}) as JsonObject;
    const unchanged = isDeepStrictEqual(servers.markuprplus, server);
    if (servers.markuprplus !== undefined && !unchanged && !options.force) {
      throw new Error(`markuprplus is already configured in ${path}. Use --force to replace it.`);
    }
    return {
      path, original, unchanged,
      contents: `${JSON.stringify({ ...config, mcpServers: { ...servers, markuprplus: server } }, null, 2)}\n`,
    };
  }));
  if (options.dryRun) return result;
  for (const file of prepared) {
    if (file.unchanged) continue;
    await mkdir(dirname(file.path), { recursive: true });
    await ensureUnchanged(file.path, file.original);
    result.backupPaths.push(...await backup(file.path, file.original));
    const temporaryPath = `${file.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, file.contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, file.path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    result.changed = true;
  }
  return result;
}

export function registerIntegrationCommand(program: Command): void {
  program.command('integrate')
    .description('Connect Copilot CLI, the Claude Mac app (Chat and Code), or Codex to MarkuprPlus MCP')
    .addArgument(new Argument('<client>', 'Client to configure').choices([...CLIENTS]))
    .option('--dry-run', 'Preview the server entry and target paths without changing configuration')
    .option('--force', 'Replace an existing markuprplus server entry, keeping a backup')
    .action(async (client: McpClient, flags: { dryRun?: boolean; force?: boolean }) => {
      try {
        const cliPath = await realpath(resolve(process.argv[1]));
        const serverPath = resolve(dirname(cliPath), '..', 'mcp', 'index.mjs');
        await access(serverPath);
        const result = await configureMcpClient(client, {
          ...flags, homeDirectory: homedir(), platform: process.platform,
          nodePath: process.execPath, serverPath, env: process.env,
        });
        console.log(`${flags.dryRun ? 'Preview for' : result.changed ? 'Configured' : 'Already configured'} ${client}:`);
        result.paths.forEach((path) => console.log(`  ${path}`));
        if (flags.dryRun) console.log(result.preview);
        result.backupPaths.forEach((path) => console.log(`Backup: ${path}`));
        if (!flags.dryRun) console.log('Restart the client to load MarkuprPlus MCP.');
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'MCP integration setup failed.');
        process.exitCode = 1;
      }
    });
}
