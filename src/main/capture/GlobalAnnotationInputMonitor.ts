import { spawn as nodeSpawn } from 'child_process';
import type { GlobalAnnotationInputSample } from './annotationInputModel';

type MonitorState = 'idle' | 'starting' | 'running' | 'unsupported' | 'failed';

export interface AnnotationInputHealth {
  state: MonitorState;
  platform: NodeJS.Platform;
  restartCount: number;
  error?: string;
}

interface DataStreamLike {
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
}

export interface SpawnedAnnotationInputProcess {
  stdout: DataStreamLike;
  stderr: DataStreamLike;
  killed: boolean;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
}

interface AnnotationSpawnOptions {
  env: NodeJS.ProcessEnv;
  windowsHide: boolean;
  stdio: ['ignore', 'pipe', 'pipe'];
}

type SpawnAnnotationProcess = (
  command: string,
  args: string[],
  options: AnnotationSpawnOptions,
) => SpawnedAnnotationInputProcess;

type Schedule = (callback: () => void, delayMs: number) => unknown;
type CancelSchedule = (handle: unknown) => void;

export interface GlobalAnnotationInputMonitor {
  start(listener: (sample: GlobalAnnotationInputSample) => void): Promise<void>;
  stop(): Promise<void>;
  health(): AnnotationInputHealth;
}

interface MonitorOptions {
  platform?: NodeJS.Platform;
  spawn?: SpawnAnnotationProcess;
  env?: NodeJS.ProcessEnv;
  schedule?: Schedule;
  cancelSchedule?: CancelSchedule;
}

const MAX_LINE_BYTES = 1_024;
const MAX_RESTARTS = 1;
const RESTART_DELAY_MS = 100;
const KILL_GRACE_MS = 250;

const MAC_INPUT_OBSERVER_JXA = String.raw`
ObjC.import('Foundation');
ObjC.import('CoreGraphics');
var output = $.NSFileHandle.fileHandleWithStandardOutput;
var sequence = 0;
var previousModifier = null;
var previousPrimary = null;
function emit(value) {
  var line = $(JSON.stringify(value) + '\n');
  output.writeData(line.dataUsingEncoding($.NSUTF8StringEncoding));
}
while (true) {
  var flags = Number($.CGEventSourceFlagsState($.kCGEventSourceStateCombinedSessionState));
  var modifierDown = Boolean(flags & 1048576);
  var primaryDown = Boolean($.CGEventSourceButtonState($.kCGEventSourceStateCombinedSessionState, 0));
  if (previousModifier === null || modifierDown !== previousModifier || primaryDown !== previousPrimary) {
    var event = $.CGEventCreate(null);
    var point = event ? $.CGEventGetLocation(event) : { x: 0, y: 0 };
    sequence += 1;
    emit({
      sequence: sequence,
      modifierDown: modifierDown,
      primaryDown: primaryDown,
      cursor: { x: Number(point.x), y: Number(point.y) },
      capturedAt: Date.now()
    });
    previousModifier = modifierDown;
    previousPrimary = primaryDown;
  }
  $.NSThread.sleepForTimeInterval(0.008333);
}
`;

const WINDOWS_INPUT_OBSERVER_POWERSHELL = String.raw`
$signature = @'
using System;
using System.Runtime.InteropServices;
public static class MarkuprXAnnotationInputProbe {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
}
'@
Add-Type -TypeDefinition $signature
$sequence = 0
$previousModifier = $null
$previousPrimary = $null
while ($true) {
  $modifierDown = (([MarkuprXAnnotationInputProbe]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0)
  $primaryDown = (([MarkuprXAnnotationInputProbe]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0)
  if ($null -eq $previousModifier -or $modifierDown -ne $previousModifier -or $primaryDown -ne $previousPrimary) {
    $point = New-Object MarkuprXAnnotationInputProbe+POINT
    [void][MarkuprXAnnotationInputProbe]::GetCursorPos([ref]$point)
    $sequence += 1
    $payload = [ordered]@{
      sequence = $sequence
      modifierDown = $modifierDown
      primaryDown = $primaryDown
      cursor = [ordered]@{ x = $point.X; y = $point.Y }
      capturedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($payload)
    [Console]::Out.Flush()
    $previousModifier = $modifierDown
    $previousPrimary = $primaryDown
  }
  Start-Sleep -Milliseconds 8
}
`;

function minimalEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = [
    'PATH', 'HOME', 'USERPROFILE', 'LANG', 'TMPDIR', 'TEMP',
    'SystemRoot', 'ComSpec', 'PATHEXT',
  ] as const;
  return Object.fromEntries(
    names.flatMap((name) => typeof env[name] === 'string' ? [[name, env[name]]] : []),
  );
}

function observerCommand(platform: NodeJS.Platform): { command: string; args: string[] } | null {
  if (platform === 'darwin') {
    return {
      command: '/usr/bin/osascript',
      args: ['-l', 'JavaScript', '-e', MAC_INPUT_OBSERVER_JXA],
    };
  }
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command', WINDOWS_INPUT_OBSERVER_POWERSHELL,
      ],
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSample(line: string): GlobalAnnotationInputSample | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.cursor)) return null;
  const cursor = value.cursor;
  if (!Number.isSafeInteger(value.sequence)
    || Number(value.sequence) < 0
    || typeof value.modifierDown !== 'boolean'
    || typeof value.primaryDown !== 'boolean'
    || typeof cursor.x !== 'number'
    || !Number.isFinite(cursor.x)
    || typeof cursor.y !== 'number'
    || !Number.isFinite(cursor.y)
    || typeof value.capturedAt !== 'number'
    || !Number.isFinite(value.capturedAt)
    || value.capturedAt < 0) {
    return null;
  }
  return {
    sequence: Number(value.sequence),
    modifierDown: value.modifierDown,
    primaryDown: value.primaryDown,
    cursor: { x: cursor.x, y: cursor.y },
    capturedAt: value.capturedAt,
  };
}

class GlobalAnnotationInputMonitorImpl implements GlobalAnnotationInputMonitor {
  private readonly platform: NodeJS.Platform;
  private readonly spawnProcess: SpawnAnnotationProcess;
  private readonly env: NodeJS.ProcessEnv;
  private readonly schedule: Schedule;
  private readonly cancelSchedule: CancelSchedule;
  private listener: ((sample: GlobalAnnotationInputSample) => void) | null = null;
  private child: SpawnedAnnotationInputProcess | null = null;
  private restartHandle: unknown = null;
  private killHandle: unknown = null;
  private lineBuffer = '';
  private droppingOversizedLine = false;
  private rawSequence = -1;
  private emittedSequence = 0;
  private stopping = false;
  private status: AnnotationInputHealth;

  constructor(options: MonitorOptions) {
    this.platform = options.platform || process.platform;
    this.spawnProcess = options.spawn
      || (nodeSpawn as unknown as SpawnAnnotationProcess);
    this.env = minimalEnvironment(options.env || process.env);
    this.schedule = options.schedule || ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = options.cancelSchedule || ((handle) => clearTimeout(handle as NodeJS.Timeout));
    this.status = { state: 'idle', platform: this.platform, restartCount: 0 };
  }

  async start(listener: (sample: GlobalAnnotationInputSample) => void): Promise<void> {
    if (this.status.state === 'running' || this.status.state === 'starting') return;
    this.listener = listener;
    this.stopping = false;
    this.rawSequence = -1;
    this.emittedSequence = 0;
    this.status = { state: 'starting', platform: this.platform, restartCount: 0 };

    if (!observerCommand(this.platform)) {
      this.status = {
        state: 'unsupported',
        platform: this.platform,
        restartCount: 0,
        error: 'Global modifier observation is unavailable on this platform.',
      };
      return;
    }

    this.launchChild();
  }

  async stop(): Promise<void> {
    if (this.stopping && this.status.state === 'idle') return;
    this.stopping = true;
    this.listener = null;
    if (this.restartHandle !== null) {
      this.cancelSchedule(this.restartHandle);
      this.restartHandle = null;
    }
    const active = this.child;
    this.status = { state: 'idle', platform: this.platform, restartCount: 0 };
    if (!active) return;

    active.kill('SIGTERM');
    this.killHandle = this.schedule(() => {
      this.killHandle = null;
      if (this.child === active) active.kill('SIGKILL');
    }, KILL_GRACE_MS);
  }

  health(): AnnotationInputHealth {
    return { ...this.status };
  }

  private launchChild(): void {
    const invocation = observerCommand(this.platform);
    if (!invocation || this.stopping) return;
    this.rawSequence = -1;
    this.lineBuffer = '';
    this.droppingOversizedLine = false;

    let child: SpawnedAnnotationInputProcess;
    try {
      child = this.spawnProcess(invocation.command, invocation.args, {
        env: this.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      this.handleUnexpectedExit();
      return;
    }
    this.child = child;
    this.status = {
      state: 'running',
      platform: this.platform,
      restartCount: this.status.restartCount,
    };
    child.stdout.on('data', (chunk) => this.consumeOutput(chunk));
    // Always drain stderr so a verbose platform process cannot block on a full pipe.
    child.stderr.on('data', () => undefined);
    child.once('error', () => this.handleChildFailure(child));
    child.once('exit', () => this.handleChildFailure(child));
  }

  private handleChildFailure(child: SpawnedAnnotationInputProcess): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.killHandle !== null) {
      this.cancelSchedule(this.killHandle);
      this.killHandle = null;
    }
    if (this.stopping) return;
    this.handleUnexpectedExit();
  }

  private handleUnexpectedExit(): void {
    if (this.stopping) return;
    if (this.status.restartCount >= MAX_RESTARTS) {
      this.status = {
        state: 'failed',
        platform: this.platform,
        restartCount: this.status.restartCount,
        error: 'Global annotation input observer exited unexpectedly.',
      };
      return;
    }

    const restartCount = this.status.restartCount + 1;
    this.status = { state: 'starting', platform: this.platform, restartCount };
    let firedSynchronously = false;
    const handle = this.schedule(() => {
      firedSynchronously = true;
      this.restartHandle = null;
      this.launchChild();
    }, RESTART_DELAY_MS);
    if (!firedSynchronously) this.restartHandle = handle;
  }

  private consumeOutput(chunk: Buffer | string): void {
    let remaining = chunk.toString();
    while (remaining.length > 0) {
      const newline = remaining.indexOf('\n');
      const fragment = newline >= 0 ? remaining.slice(0, newline) : remaining;
      remaining = newline >= 0 ? remaining.slice(newline + 1) : '';

      if (!this.droppingOversizedLine) {
        this.lineBuffer += fragment;
        if (Buffer.byteLength(this.lineBuffer, 'utf8') > MAX_LINE_BYTES) {
          this.lineBuffer = '';
          this.droppingOversizedLine = true;
        }
      }

      if (newline < 0) break;
      if (!this.droppingOversizedLine && this.lineBuffer.trim()) {
        this.deliverLine(this.lineBuffer.trim());
      }
      this.lineBuffer = '';
      this.droppingOversizedLine = false;
    }
  }

  private deliverLine(line: string): void {
    const parsed = parseSample(line);
    if (!parsed || parsed.sequence <= this.rawSequence || !this.listener) return;
    this.rawSequence = parsed.sequence;
    this.emittedSequence += 1;
    this.listener({ ...parsed, sequence: this.emittedSequence });
  }
}

export function createGlobalAnnotationInputMonitor(
  options: MonitorOptions = {},
): GlobalAnnotationInputMonitor {
  return new GlobalAnnotationInputMonitorImpl(options);
}
