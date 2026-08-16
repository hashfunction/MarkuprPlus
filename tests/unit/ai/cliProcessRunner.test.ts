import { describe, expect, it } from 'vitest';
import { runCliProcess } from '../../../src/main/ai/CliProcessRunner';

describe('runCliProcess', () => {
  it('delivers stdin and captures command output without a shell', async () => {
    const result = await runCliProcess({
      executable: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      stdin: 'session transcript',
      timeoutMs: 2_000,
      maxOutputBytes: 1_024,
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'session transcript',
      stderr: '',
      timedOut: false,
      truncated: false,
    });
  });

  it('caps captured output while still waiting for the command to exit', async () => {
    const result = await runCliProcess({
      executable: process.execPath,
      args: ['-e', "process.stdout.write('a'.repeat(32)); process.stderr.write('b'.repeat(32))"],
      timeoutMs: 2_000,
      maxOutputBytes: 12,
    });

    expect(result.exitCode).toBe(0);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(12);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(12);
    expect(result.truncated).toBe(true);
  });

  it('terminates commands that exceed their timeout', async () => {
    const startedAt = Date.now();
    const result = await runCliProcess({
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      timeoutMs: 50,
      maxOutputBytes: 1_024,
    });

    expect(result.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('returns spawn errors as diagnostics instead of hanging', async () => {
    const result = await runCliProcess({
      executable: '/definitely/missing/markuprx-command',
      args: [],
      timeoutMs: 500,
      maxOutputBytes: 1_024,
    });

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain('ENOENT');
    expect(result.timedOut).toBe(false);
  });
});
