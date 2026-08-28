import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveCliInvocation,
  resolveProcessTreeTermination,
  runCliProcess,
} from '../../../src/main/ai/CliProcessRunner';

describe('resolveCliInvocation', () => {
  it('runs Windows command shims through a fixed PowerShell wrapper without interpolating args', () => {
    const hostileModel = 'model & echo injected > C:\\sensitive.txt';
    const invocation = resolveCliInvocation({
      executable: 'C:\\Program Files\\nodejs\\agent.cmd',
      args: ['--model', hostileModel],
      env: { PATH: 'C:\\Windows\\System32' },
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    }, 'win32');

    expect(invocation.executable).toBe('powershell.exe');
    expect(invocation.args).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand',
      expect.any(String),
    ]);
    expect(invocation.args.join(' ')).not.toContain(hostileModel);
    expect(invocation.env?.MARKUPRPLUS_CLI_EXECUTABLE)
      .toBe('C:\\Program Files\\nodejs\\agent.cmd');
    expect(JSON.parse(invocation.env?.MARKUPRPLUS_CLI_ARGUMENTS || 'null'))
      .toEqual(['--model', hostileModel]);
  });
});

describe('resolveProcessTreeTermination', () => {
  it('uses taskkill to terminate the complete Windows process tree', () => {
    expect(resolveProcessTreeTermination(4321, 'win32')).toEqual({
      executable: 'taskkill.exe',
      args: ['/PID', '4321', '/T', '/F'],
    });
  });
});

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

  it('terminates descendants when a command exceeds its timeout', async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'markuprplus-cli-timeout-'));
    const sentinel = join(temporaryDirectory, 'descendant-survived.txt');
    const descendantScript = [
      "const { writeFileSync } = require('node:fs');",
      `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, 'alive'), 500);`,
      'setInterval(() => {}, 1_000);',
    ].join(' ');
    const parentScript = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore' });`,
      'setInterval(() => {}, 1_000);',
    ].join(' ');

    try {
      const result = await runCliProcess({
        executable: process.execPath,
        args: ['-e', parentScript],
        timeoutMs: 100,
        maxOutputBytes: 1_024,
      });
      await new Promise((resolve) => setTimeout(resolve, 700));

      expect(result.timedOut).toBe(true);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
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
