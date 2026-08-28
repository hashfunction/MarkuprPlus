import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('continuous integration workflow', () => {
  it('accepts the repository workflow when every pushed commit runs the required checks', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-ci.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stdout: 'CI workflow verification passed.\n',
      stderr: '',
    });
  });
});
