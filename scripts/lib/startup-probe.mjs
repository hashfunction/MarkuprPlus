import { spawn, spawnSync } from 'node:child_process';

const READY_MARKER = '[Main] Popover ready to show';
const SINGLE_INSTANCE_MARKER = 'Another instance is running';

function defaultSignalProcessTree(child, signal, platform = process.platform) {
  if (!child.pid) return;

  if (platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T'];
    if (signal === 'SIGKILL') args.push('/F');
    const result = spawnSync('taskkill', args, { stdio: 'ignore' });
    if (result.status !== 0 && child.exitCode === null) {
      child.kill(signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM');
    }
    return;
  }

  try {
    // The probe starts its child detached on Unix, making the child the leader
    // of a dedicated process group. A negative pid therefore reaches Electron
    // helpers as well as the app process itself.
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code === 'ESRCH') return;
    child.kill(signal);
  }
}

/**
 * Start a packaged app, wait for its readiness marker, and fully reap the
 * spawned process tree before resolving or rejecting.
 */
export function runStartupProbe(executablePath, args, env, options = {}) {
  const {
    platform = process.platform,
    readyTimeoutMs = 30_000,
    shutdownGraceMs = 2_000,
    signalProcessTree = (child, signal) => defaultSignalProcessTree(child, signal, platform),
    spawnProcess = spawn,
  } = options;
  const child = spawnProcess(executablePath, args, {
    detached: platform !== 'win32',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolveProbe, rejectProbe) => {
    let output = '';
    let ready = false;
    let closed = false;
    let settled = false;
    let outcome = null;
    let shutdownTimer = null;
    let shutdownSignals = [];
    let shutdownIndex = -1;

    const clearTimers = () => {
      clearTimeout(readyTimer);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      shutdownTimer = null;
    };

    const settleAfterExit = () => {
      if (settled || !closed || !outcome) return;
      settled = true;
      clearTimers();
      if (outcome.error) rejectProbe(outcome.error);
      else resolveProbe();
    };

    const sendNextSignal = () => {
      if (closed || settled) return;
      shutdownIndex += 1;
      const signal = shutdownSignals[shutdownIndex];
      if (!signal) return;
      try {
        signalProcessTree(child, signal);
      } catch (error) {
        if (!outcome?.error) {
          outcome = { error: error instanceof Error ? error : new Error(String(error)) };
        }
      }
      if (closed || settled) return;
      if (shutdownIndex + 1 < shutdownSignals.length) {
        shutdownTimer = setTimeout(sendNextSignal, shutdownGraceMs);
      }
    };

    const requestShutdown = (nextOutcome, signals) => {
      if (outcome) return;
      outcome = nextOutcome;
      clearTimeout(readyTimer);
      shutdownSignals = signals;
      sendNextSignal();
    };

    const readyTimer = setTimeout(() => {
      requestShutdown(
        {
          error: new Error(
            `Packaged app did not become ready within ${readyTimeoutMs / 1_000} seconds.\n${output}`,
          ),
        },
        ['SIGTERM', 'SIGKILL'],
      );
    }, readyTimeoutMs);

    const inspectOutput = (chunk) => {
      if (settled) return;
      output += chunk.toString();
      if (output.includes(SINGLE_INSTANCE_MARKER)) {
        requestShutdown(
          { error: new Error(`Packaged app hit a single-instance collision.\n${output}`) },
          ['SIGTERM', 'SIGKILL'],
        );
        return;
      }
      const mainInitializationComplete = /\[Main\] [^\r\n]+ initialization complete/.test(output);
      if (!ready && (output.includes(READY_MARKER) || mainInitializationComplete)) {
        ready = true;
        requestShutdown({ error: null }, ['SIGINT', 'SIGTERM', 'SIGKILL']);
      }
    };

    child.stdout?.on('data', inspectOutput);
    child.stderr?.on('data', inspectOutput);
    child.on('error', (error) => {
      if (settled || outcome) return;
      outcome = { error };
      clearTimeout(readyTimer);
      if (!child.pid) {
        closed = true;
        settleAfterExit();
        return;
      }
      shutdownSignals = ['SIGTERM', 'SIGKILL'];
      sendNextSignal();
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      closed = true;
      if (!outcome) {
        outcome = {
          error: new Error(
            `Packaged app exited before reporting readiness (code=${code}, signal=${signal}).\n${output}`,
          ),
        };
      }
      settleAfterExit();
    });
  });
}
