import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('repository brand audit', () => {
  it('enforces canonical product and machine identities across repository files', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-brand.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(output).toMatch(/Brand audit passed across \d+ repository files\./);
  });
});
