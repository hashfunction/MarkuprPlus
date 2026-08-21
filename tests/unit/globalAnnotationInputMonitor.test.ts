import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import {
  createGlobalAnnotationInputMonitor,
  type SpawnedAnnotationInputProcess,
} from '../../src/main/capture/GlobalAnnotationInputMonitor';

class FakeProcess extends EventEmitter implements SpawnedAnnotationInputProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

function sample(sequence: number, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sequence,
    modifierDown: false,
    primaryDown: false,
    cursor: { x: 40, y: 80 },
    capturedAt: 1_000 + sequence,
    ...overrides,
  });
}

describe('GlobalAnnotationInputMonitor', () => {
  it('reports unsupported without starting a child on unsupported platforms', async () => {
    const spawn = vi.fn();
    const monitor = createGlobalAnnotationInputMonitor({ platform: 'linux', spawn });

    await monitor.start(() => undefined);

    expect(monitor.health()).toEqual({
      state: 'unsupported',
      platform: 'linux',
      restartCount: 0,
      error: 'Global modifier observation is unavailable on this platform.',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does not launch the macOS observer when external processes are forbidden', async () => {
    const spawn = vi.fn();
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn,
      externalProcessAllowed: false,
    });

    await monitor.start(() => undefined);

    expect(monitor.health()).toEqual({
      state: 'unsupported',
      platform: 'darwin',
      restartCount: 0,
      error: 'Global modifier observation is unavailable in this distribution.',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('starts the macOS Quartz observer with a minimal child environment', async () => {
    const child = new FakeProcess();
    const spawn = vi.fn(() => child);
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/Users/tester',
        LANG: 'en_CA.UTF-8',
        SECRET_TOKEN: 'must-not-leak',
      },
    });

    await monitor.start(() => undefined);

    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe('/usr/bin/osascript');
    expect(args.slice(0, 3)).toEqual(['-l', 'JavaScript', '-e']);
    expect(args[3]).toContain('CGEventSourceFlagsState');
    expect(args[3]).toContain('0.008333');
    expect(options).toMatchObject({ windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(options.env).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/tester',
      LANG: 'en_CA.UTF-8',
    });
    expect(monitor.health().state).toBe('running');
  });

  it('uses the hidden User32 observer on Windows', async () => {
    const child = new FakeProcess();
    const spawn = vi.fn(() => child);
    const monitor = createGlobalAnnotationInputMonitor({ platform: 'win32', spawn });

    await monitor.start(() => undefined);

    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe('powershell.exe');
    expect(args.slice(0, 4)).toEqual([
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    ]);
    expect(args[5]).toContain('GetAsyncKeyState');
    expect(args[5]).toContain('Start-Sleep -Milliseconds 8');
    expect(options.windowsHide).toBe(true);
  });

  it('delivers complete validated lines and ignores malformed, duplicate, or oversized output', async () => {
    const child = new FakeProcess();
    const received: unknown[] = [];
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn: () => child,
    });
    await monitor.start((value) => received.push(value));

    child.stdout.emit('data', Buffer.from(`${sample(1)}\n{bad-json}\n`));
    child.stdout.emit('data', Buffer.from(`${sample(1)}\n`));
    child.stdout.emit('data', Buffer.from(`${'x'.repeat(1_100)}\n`));
    child.stdout.emit('data', Buffer.from(`${sample(2, { modifierDown: true }).slice(0, 45)}`));
    child.stdout.emit('data', Buffer.from(`${sample(2, { modifierDown: true }).slice(45)}\n`));
    child.stdout.emit('data', Buffer.from(`${sample(3, { cursor: { x: 'bad', y: 2 } })}\n`));

    expect(received).toEqual([
      {
        sequence: 1,
        modifierDown: false,
        primaryDown: false,
        cursor: { x: 40, y: 80 },
        capturedAt: 1_001,
      },
      {
        sequence: 2,
        modifierDown: true,
        primaryDown: false,
        cursor: { x: 40, y: 80 },
        capturedAt: 1_002,
      },
    ]);
  });

  it('restarts once after an unexpected exit and then fails closed', async () => {
    const children = [new FakeProcess(), new FakeProcess(), new FakeProcess()];
    const spawn = vi.fn(() => children[spawn.mock.calls.length - 1]);
    const schedule = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn,
      schedule,
      cancelSchedule: vi.fn(),
    });
    await monitor.start(() => undefined);

    children[0].emit('exit', 1, null);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(monitor.health()).toMatchObject({ state: 'running', restartCount: 1 });

    children[1].emit('exit', 1, null);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(monitor.health()).toMatchObject({
      state: 'failed',
      restartCount: 1,
      error: 'Global annotation input observer exited unexpectedly.',
    });
  });

  it('stops idempotently, kills the active child, and never restarts it', async () => {
    const child = new FakeProcess();
    const spawn = vi.fn(() => child);
    const schedule = vi.fn();
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn,
      schedule,
    });
    await monitor.start(() => undefined);

    await monitor.stop();
    await monitor.stop();
    child.emit('exit', 0, 'SIGTERM');

    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(schedule).toHaveBeenCalledOnce();
    expect(monitor.health()).toEqual({
      state: 'idle',
      platform: 'darwin',
      restartCount: 0,
    });
  });

  it('escalates monitor shutdown when the child ignores SIGTERM', async () => {
    const child = new FakeProcess();
    let scheduled: (() => void) | null = null;
    const monitor = createGlobalAnnotationInputMonitor({
      platform: 'darwin',
      spawn: () => child,
      schedule: (callback) => {
        scheduled = callback;
        return 1;
      },
      cancelSchedule: vi.fn(),
    });
    await monitor.start(() => undefined);

    await monitor.stop();
    scheduled?.();

    expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
  });
});
