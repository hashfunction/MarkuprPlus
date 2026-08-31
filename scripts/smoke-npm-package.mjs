#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const tarballArgument = process.argv[2];
if (!tarballArgument) {
  console.error('Usage: node scripts/smoke-npm-package.mjs <markuprplus-tarball>');
  process.exit(2);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const tarball = resolve(tarballArgument);
assert.equal(basename(tarball), `${packageJson.name}-${packageJson.version}.tgz`);
const temporaryRoot = mkdtempSync(join(tmpdir(), 'markuprplus-npm-smoke-'));
const prefix = join(temporaryRoot, 'prefix');
const executableSuffix = process.platform === 'win32' ? '.cmd' : '';
const binDirectory = process.platform === 'win32' ? prefix : join(prefix, 'bin');
const cli = join(binDirectory, `markuprplus${executableSuffix}`);
const mcp = join(binDirectory, `markuprplus-mcp${executableSuffix}`);

function inheritedEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
  );
}

let client;
let stderr = '';

try {
  execFileSync('npm', ['install', '--global', '--prefix', prefix, tarball], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim();
  assert.equal(version, packageJson.version);

  const help = execFileSync(cli, ['--help'], { encoding: 'utf8' });
  assert.match(help, /^Usage: markuprplus/m);
  assert.match(help, /MarkuprPlus/);

  const environment = inheritedEnvironment();
  delete environment.ANTHROPIC_API_KEY;
  delete environment.LINEAR_API_KEY;

  const transport = new StdioClientTransport({
    command: mcp,
    env: environment,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  client = new Client({ name: 'markuprplus-package-smoke', version: '1.0.0' });
  await client.connect(transport);

  assert.deepEqual(client.getServerVersion(), {
    name: 'MarkuprPlus',
    version: packageJson.version,
  });

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map(({ name }) => name).sort(),
    [
      'analyze_screenshot',
      'analyze_video',
      'capture_screenshot',
      'capture_with_voice',
      'describe_screen',
      'push_to_github',
      'push_to_linear',
      'start_recording',
      'stop_recording',
    ],
  );

  const { resources } = await client.listResources();
  assert.ok(resources.some(({ uri }) => uri === 'session://latest'));

  const latest = await client.readResource({ uri: 'session://latest' });
  assert.equal(latest.contents[0]?.mimeType, 'application/json');

  const safeToolResult = await client.callTool({
    name: 'push_to_linear',
    arguments: {
      reportPath: join(temporaryRoot, 'does-not-exist.md'),
      teamKey: 'TEST',
      dryRun: true,
    },
  });
  assert.equal(safeToolResult.isError, true);
  assert.match(safeToolResult.content[0]?.text ?? '', /No Linear API token provided/);

  console.log(JSON.stringify({
    package: `${packageJson.name}@${packageJson.version}`,
    cli,
    mcp,
    server: client.getServerVersion(),
    tools: tools.map(({ name }) => name),
    resources: resources.map(({ uri }) => uri),
    safeToolDispatch: 'push_to_linear returned the expected no-token error',
  }, null, 2));
} catch (error) {
  if (stderr) console.error(stderr.trim());
  throw error;
} finally {
  await client?.close().catch(() => {});
  rmSync(temporaryRoot, { recursive: true, force: true });
}
