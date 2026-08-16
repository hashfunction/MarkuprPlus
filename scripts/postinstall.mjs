#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isRailwayEnvironment() {
  return Object.keys(process.env).some((key) => key.startsWith('RAILWAY_'));
}

function isInstalledAsDependency() {
  // When installed from npm as a dependency, the package lives inside
  // another project's node_modules. The source repo has a src/ directory
  // at the root -- installed packages do not.
  const repoRoot = join(__dirname, '..');
  return !existsSync(join(repoRoot, 'src'));
}

function run(command, args) {
  const commandLabel = [command, ...args].join(' ');
  console.log(`[postinstall] Running: ${commandLabel}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[postinstall] Failed to execute "${commandLabel}":`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[postinstall] Command failed: ${commandLabel} (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

if (process.env.MARKUPRX_SKIP_ELECTRON_POSTINSTALL === '1' || isRailwayEnvironment() || isInstalledAsDependency()) {
  // Skip Electron native rebuild when: env var is set, Railway environment,
  // or installed as an npm dependency (CLI/MCP usage -- no Electron needed).
  process.exit(0);
}

run('npx', ['electron-builder', 'install-app-deps']);
run('npx', ['electron-rebuild']);
