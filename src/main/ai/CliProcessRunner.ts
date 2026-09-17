import { spawn } from 'node:child_process';

export interface CliProcessOptions {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /** Capture only these JSONL event types; the event's first property must be type. */
  stdoutJsonlTypes?: string[];
}

export interface CliProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface ResolvedCliInvocation {
  executable: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedProcessTreeTermination {
  executable: string;
  args: string[];
}

const WINDOWS_COMMAND_SHIM_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$cliArguments = @(ConvertFrom-Json -InputObject $env:MARKUPRPLUS_CLI_ARGUMENTS)',
  '& $env:MARKUPRPLUS_CLI_EXECUTABLE @cliArguments',
  'exit $LASTEXITCODE',
].join('\n');

const WINDOWS_COMMAND_SHIM_SCRIPT_BASE64 = Buffer
  .from(WINDOWS_COMMAND_SHIM_SCRIPT, 'utf16le')
  .toString('base64');

/** Resolve Windows npm command shims without interpolating arguments into shell source. */
export function resolveCliInvocation(
  options: CliProcessOptions,
  platform: NodeJS.Platform = process.platform,
): ResolvedCliInvocation {
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(options.executable)) {
    return {
      executable: options.executable,
      args: options.args,
      env: options.env,
    };
  }

  return {
    executable: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', WINDOWS_COMMAND_SHIM_SCRIPT_BASE64,
    ],
    env: {
      ...(options.env ?? process.env),
      MARKUPRPLUS_CLI_EXECUTABLE: options.executable,
      MARKUPRPLUS_CLI_ARGUMENTS: JSON.stringify(options.args),
    },
  };
}

interface BoundedOutput {
  append(chunk: Buffer): void;
  text(): string;
  readonly truncated: boolean;
}

function createBoundedOutput(maxBytes: number): BoundedOutput {
  const chunks: Buffer[] = [];
  let capturedBytes = 0;
  let wasTruncated = false;

  return {
    append(chunk: Buffer): void {
      if (capturedBytes >= maxBytes) {
        wasTruncated = true;
        return;
      }

      const remaining = maxBytes - capturedBytes;
      const captured = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(captured);
      capturedBytes += captured.byteLength;
      if (captured.byteLength < chunk.byteLength) {
        wasTruncated = true;
      }
    },
    text(): string {
      return Buffer.concat(chunks).toString('utf8');
    },
    get truncated(): boolean {
      return wasTruncated;
    },
  };
}

/** Inspect a bounded ASCII header, then stream or discard the rest of each line. */
function createJsonlOutput(maxBytes: number, eventTypes: string[]): BoundedOutput {
  const output = createBoundedOutput(maxBytes);
  const allowed = new Set(eventTypes);
  let prefix = Buffer.alloc(0);
  let selected: boolean | undefined;
  return {
    append(chunk) {
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline + 1;
        let segment = chunk.subarray(offset, end);
        if (selected === undefined) {
          const count = Math.min(segment.length, 256 - prefix.length);
          prefix = Buffer.concat([prefix, segment.subarray(0, count)]);
          segment = segment.subarray(count);
          const match = prefix.toString('utf8').match(/^\s*\{\s*"type"\s*:\s*"([^"]+)"/);
          if (match) selected = allowed.has(match[1]);
          else if (prefix.length === 256 || newline >= 0) selected = false;
          if (selected) output.append(prefix);
          if (selected !== undefined) prefix = Buffer.alloc(0);
        }
        if (selected) output.append(segment);
        if (newline >= 0) { selected = undefined; prefix = Buffer.alloc(0); }
        offset = end;
      }
    },
    text: () => output.text(),
    get truncated() { return output.truncated; },
  };
}

export function resolveProcessTreeTermination(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): ResolvedProcessTreeTermination | null {
  if (platform !== 'win32') return null;

  return {
    executable: 'taskkill.exe',
    args: ['/PID', String(pid), '/T', '/F'],
  };
}

function terminateProcess(pid: number | undefined): void {
  if (!pid) return;

  const termination = resolveProcessTreeTermination(pid);
  if (termination) {
    const fallback = (): void => {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // The command may already have exited.
      }
    };
    try {
      const terminator = spawn(termination.executable, termination.args, {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      terminator.once('error', fallback);
      terminator.once('close', (exitCode) => {
        if (exitCode !== 0) fallback();
      });
    } catch {
      fallback();
    }
    return;
  }

  try {
    if (process.platform === 'win32') {
      process.kill(pid, 'SIGTERM');
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // The command may have exited between the timeout and termination attempt.
  }
}

/**
 * Run a CLI command without a shell and with bounded output capture.
 */
export function runCliProcess(options: CliProcessOptions): Promise<CliProcessResult> {
  return new Promise((resolve) => {
    const stdout = options.stdoutJsonlTypes
      ? createJsonlOutput(Math.max(0, options.maxOutputBytes), options.stdoutJsonlTypes)
      : createBoundedOutput(Math.max(0, options.maxOutputBytes));
    const stderr = createBoundedOutput(Math.max(0, options.maxOutputBytes));
    let timedOut = false;
    let settled = false;
    const invocation = resolveCliInvocation(options);

    const child = spawn(invocation.executable, invocation.args, {
      cwd: options.cwd,
      env: invocation.env,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode,
        stdout: stdout.text(),
        stderr: stderr.text(),
        timedOut,
        truncated: stdout.truncated || stderr.truncated,
      });
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout.append(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr.append(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.once('error', (error) => {
      stderr.append(Buffer.from(error.message));
      finish(null);
    });
    child.once('close', (exitCode) => finish(exitCode));

    if (options.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    } else {
      child.stdin?.end();
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcess(child.pid);
    }, Math.max(1, options.timeoutMs));
    timeout.unref();
  });
}
