import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerBridgeCommand,
  type BridgeLifecycle,
} from '../../src/bridge/BridgeCommand';

function lifecycle(): BridgeLifecycle {
  return {
    install: vi.fn(async () => ({ token: 'h'.repeat(43), created: true })),
    serve: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ installed: true, running: true, protocolVersion: 1 })),
    token: vi.fn(async () => 'h'.repeat(43)),
    rotateToken: vi.fn(async () => 'i'.repeat(43)),
    uninstall: vi.fn(async () => undefined),
  };
}

async function run(
  args: string[],
  bridgeLifecycle: BridgeLifecycle,
): Promise<{ output: string[]; errors: string[] }> {
  const output: string[] = [];
  const errors: string[] = [];
  const program = new Command();
  program.exitOverride();
  registerBridgeCommand(program, {
    lifecycle: bridgeLifecycle,
    write: (line) => output.push(line),
    writeError: (line) => errors.push(line),
  });
  await program.parseAsync(['node', 'markuprx', 'bridge', ...args]);
  return { output, errors };
}

describe('markuprx bridge commands', () => {
  let bridgeLifecycle: BridgeLifecycle;

  beforeEach(() => {
    bridgeLifecycle = lifecycle();
  });

  it('installs and prints the new pairing token only from explicit setup', async () => {
    const result = await run(['install'], bridgeLifecycle);
    expect(result.output.join('\n')).toContain('h'.repeat(43));
    expect(result.output.join('\n')).toContain('Pairing token');
    expect(bridgeLifecycle.install).toHaveBeenCalledOnce();
  });

  it('reports status without retrieving or printing the token', async () => {
    const result = await run(['status'], bridgeLifecycle);
    expect(result.output.join('\n')).toContain('Installed: yes');
    expect(result.output.join('\n')).toContain('Running: yes');
    expect(result.output.join('\n')).not.toContain('h'.repeat(43));
    expect(bridgeLifecycle.token).not.toHaveBeenCalled();
  });

  it('exposes the token and rotation only through explicit commands', async () => {
    expect((await run(['token'], bridgeLifecycle)).output).toEqual(['h'.repeat(43)]);
    expect((await run(['rotate-token'], bridgeLifecycle)).output.join('\n'))
      .toContain('i'.repeat(43));
  });

  it.each([
    ['serve', 'serve'],
    ['start', 'start'],
    ['stop', 'stop'],
    ['uninstall', 'uninstall'],
  ] as const)('routes %s to the lifecycle', async (command, method) => {
    await run([command], bridgeLifecycle);
    expect(bridgeLifecycle[method]).toHaveBeenCalledOnce();
  });
});
