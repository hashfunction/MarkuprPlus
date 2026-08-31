import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('published CLI bridge bundle', () => {
  it('exposes every companion lifecycle command from the built CLI', async () => {
    await execFileAsync(process.execPath, ['scripts/build-cli.mjs'], {
      cwd: process.cwd(),
      timeout: 30_000,
    });
    const { stdout } = await execFileAsync(
      process.execPath,
      ['dist/cli/index.mjs', 'bridge', '--help'],
      { cwd: process.cwd(), timeout: 10_000 },
    );

    for (const command of [
      'install',
      'serve',
      'start',
      'stop',
      'status',
      'token',
      'rotate-token',
      'uninstall',
    ]) {
      expect(stdout).toContain(command);
    }
  });
});
