import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

const repositoryRoot = join(__dirname, '../..');
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
) as {
  engines: { node: string };
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe('release toolchain contract', () => {
  it('pins the supported Node runtime for contributors', () => {
    const nodeVersionPath = join(repositoryRoot, '.node-version');
    const nodeVersion = existsSync(nodeVersionPath)
      ? readFileSync(nodeVersionPath, 'utf8').trim()
      : null;

    expect(nodeVersion).toBe('22.23.2');
    expect(packageJson.engines.node).toBe('>=20.9.0');
  });

  it('uses patched build, packaging, lint, and test dependencies', () => {
    expect(packageJson.devDependencies).toMatchObject({
      '@typescript-eslint/eslint-plugin': '^8.67.0',
      '@typescript-eslint/parser': '^8.67.0',
      '@vitest/coverage-v8': '^4.1.10',
      electron: '^43.4.0',
      'electron-builder': '^26.15.3',
      'electron-vite': '^5.0.0',
      esbuild: '^0.28.2',
      eslint: '^9.39.5',
      'eslint-plugin-react': '^7.37.5',
      'eslint-plugin-react-hooks': '^7.1.1',
      typescript: '^5.9.3',
      vite: '^7.3.6',
      vitest: '^4.1.10',
    });
  });

  it('uses deterministic forked Vitest workers without deprecated pool options', () => {
    expect(vitestConfig.test).toMatchObject({
      pool: 'forks',
      maxWorkers: 1,
      isolate: true,
    });
    expect(vitestConfig.test).not.toHaveProperty('poolOptions');
  });

  it('uses flat-config lint commands without legacy extension flags', () => {
    expect(packageJson.scripts).toMatchObject({
      lint: 'eslint src',
      'lint:fix': 'eslint src --fix',
    });
  });
});
