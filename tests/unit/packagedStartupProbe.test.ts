import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runStartupProbe } from '../../scripts/lib/startup-probe.mjs';

class FakeChild extends EventEmitter {
  readonly pid = 43210;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
}

interface ProbeHarness {
  child: FakeChild;
  signals: NodeJS.Signals[];
  run: () => Promise<void>;
}

function probeHarness(options: {
  closeOnSignal?: NodeJS.Signals;
  readyTimeoutMs?: number;
  shutdownGraceMs?: number;
} = {}): ProbeHarness {
  const child = new FakeChild();
  const signals: NodeJS.Signals[] = [];
  return {
    child,
    signals,
    run: () => runStartupProbe('/fixture/MarkuprPlus', [], {}, {
      spawnProcess: () => child,
      readyTimeoutMs: options.readyTimeoutMs ?? 100,
      shutdownGraceMs: options.shutdownGraceMs ?? 20,
      signalProcessTree: (_child, signal) => {
        signals.push(signal);
        if (signal === options.closeOnSignal) {
          queueMicrotask(() => child.emit('close', null, signal));
        }
      },
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('packaged startup probe teardown', () => {
  it('does not report readiness until the ready child exits', async () => {
    vi.useFakeTimers();
    const harness = probeHarness();
    const resolved = vi.fn();
    const rejected = vi.fn();
    const probe = harness.run();
    void probe.then(resolved, rejected);

    harness.child.stdout.emit('data', '[Main] Popover ready to show');
    await Promise.resolve();

    expect(harness.signals).toEqual(['SIGINT']);
    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();

    harness.child.emit('close', 0, 'SIGINT');
    await expect(probe).resolves.toBeUndefined();
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(rejected).not.toHaveBeenCalled();
  });

  it('accepts completed main initialization when ready-to-show is unavailable', async () => {
    vi.useFakeTimers();
    const harness = probeHarness();
    const probe = harness.run();

    harness.child.stdout.emit('data', '[Main] MarkuprPlus initialization complete');
    await Promise.resolve();
    harness.child.emit('close', 0, 'SIGINT');

    await expect(probe).resolves.toBeUndefined();
    expect(harness.signals).toEqual(['SIGINT']);
  });

  it('does not reject a timed-out probe until the child exits', async () => {
    vi.useFakeTimers();
    const harness = probeHarness();
    const rejected = vi.fn();
    const probe = harness.run();
    void probe.catch(rejected);

    await vi.advanceTimersByTimeAsync(100);

    expect(harness.signals).toEqual(['SIGTERM']);
    expect(rejected).not.toHaveBeenCalled();

    harness.child.emit('close', null, 'SIGTERM');
    await expect(probe).rejects.toThrow('did not become ready within');
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('escalates ignored graceful signals to a process-tree kill', async () => {
    vi.useFakeTimers();
    const harness = probeHarness({ closeOnSignal: 'SIGKILL' });
    const probe = harness.run();

    harness.child.stdout.emit('data', '[Main] Popover ready to show');
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(20);

    await expect(probe).resolves.toBeUndefined();
    expect(harness.signals).toEqual(['SIGINT', 'SIGTERM', 'SIGKILL']);
  });

  it('tears down a single-instance collision before rejecting', async () => {
    vi.useFakeTimers();
    const harness = probeHarness({ closeOnSignal: 'SIGTERM' });
    const probe = harness.run();

    harness.child.stderr.emit('data', 'Another instance is running');

    await expect(probe).rejects.toThrow('single-instance collision');
    expect(harness.signals).toEqual(['SIGTERM']);
  });

  it('settles exactly once when close wins an error race', async () => {
    vi.useFakeTimers();
    const harness = probeHarness();
    const resolved = vi.fn();
    const rejected = vi.fn();
    const probe = harness.run();
    void probe.then(resolved, rejected);

    harness.child.stdout.emit('data', '[Main] Popover ready to show');
    harness.child.emit('close', 0, 'SIGINT');
    harness.child.emit('error', new Error('late child error'));
    await probe;

    expect(resolved).toHaveBeenCalledTimes(1);
    expect(rejected).not.toHaveBeenCalled();
  });

  it('waits for close after a spawned child error and rejects exactly once', async () => {
    vi.useFakeTimers();
    const harness = probeHarness();
    const resolved = vi.fn();
    const rejected = vi.fn();
    const probe = harness.run();
    void probe.then(resolved, rejected);

    harness.child.emit('error', new Error('fixture child error'));
    await Promise.resolve();
    expect(harness.signals).toEqual(['SIGTERM']);
    expect(rejected).not.toHaveBeenCalled();

    harness.child.emit('close', 1, null);
    await expect(probe).rejects.toThrow('fixture child error');
    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
