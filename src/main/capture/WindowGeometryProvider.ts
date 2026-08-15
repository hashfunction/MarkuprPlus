import { execFile as nodeExecFile } from 'child_process';
import type { CapturableWindow, CaptureSource } from '../../shared/types';

type ExecCallback = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void;
type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: {
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
  },
  callback: ExecCallback,
) => unknown;

interface NativeWindowRecord {
  id: string;
  ownerPid?: number;
  ownerName: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface ProviderOptions {
  platform?: NodeJS.Platform;
  ownPid?: number;
  env?: NodeJS.ProcessEnv;
  execFile?: ExecFileLike;
}

const PROCESS_TIMEOUT_MS = 2_000;
const PROCESS_MAX_BUFFER = 2 * 1024 * 1024;

const MAC_WINDOW_LIST_JXA = `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
var ref = $.CGWindowListCopyWindowInfo(
  $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements,
  $.kCGNullWindowID
);
var list = ObjC.castRefToObject(ref);
var out = [];
for (var i = 0; i < Number(list.count); i++) {
  var windowInfo = ObjC.deepUnwrap(list.objectAtIndex(i));
  out.push({
    id: windowInfo.kCGWindowNumber,
    ownerPid: windowInfo.kCGWindowOwnerPID,
    ownerName: windowInfo.kCGWindowOwnerName || '',
    title: windowInfo.kCGWindowName || '',
    layer: windowInfo.kCGWindowLayer,
    alpha: windowInfo.kCGWindowAlpha,
    onScreen: windowInfo.kCGWindowIsOnscreen,
    bounds: windowInfo.kCGWindowBounds || {}
  });
}
JSON.stringify(out);
`;

const WINDOWS_WINDOW_LIST_POWERSHELL = `
$signature = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MarkuprWindowProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
}
'@
Add-Type -TypeDefinition $signature
$previousDpiContext = [MarkuprWindowProbe]::SetThreadDpiAwarenessContext([IntPtr](-1))
$result = @()
$handle = [MarkuprWindowProbe]::GetTopWindow([IntPtr]::Zero)
while ($handle -ne [IntPtr]::Zero) {
  $rect = New-Object MarkuprWindowProbe+RECT
  $pidValue = [uint32]0
  $titleBuffer = New-Object System.Text.StringBuilder 1024
  $cloaked = 0
  [void][MarkuprWindowProbe]::GetWindowThreadProcessId($handle, [ref]$pidValue)
  [void][MarkuprWindowProbe]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity)
  [void][MarkuprWindowProbe]::DwmGetWindowAttribute($handle, 14, [ref]$cloaked, 4)
  if ([MarkuprWindowProbe]::GetWindowRect($handle, [ref]$rect)) {
    $processName = ''
    try { $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName } catch {}
    $result += [PSCustomObject]@{
      handle = $handle.ToInt64().ToString()
      pid = [int]$pidValue
      appName = $processName
      title = $titleBuffer.ToString()
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
      visible = [MarkuprWindowProbe]::IsWindowVisible($handle)
      cloaked = ($cloaked -ne 0)
    }
  }
  $handle = [MarkuprWindowProbe]::GetWindow($handle, 2)
}
$result | ConvertTo-Json -Compress
[void][MarkuprWindowProbe]::SetThreadDpiAwarenessContext($previousDpiContext)
`;

function safeJsonArray(stdout: string): unknown[] {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (Array.isArray(parsed)) return parsed;
    return parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch {
    return [];
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sourceNativeId(source: CaptureSource): string | null {
  const match = /^window:([^:]+):[01]$/.exec(source.id);
  return match?.[1] || null;
}

function matchSource(sources: CaptureSource[], ids: string[]): CaptureSource | undefined {
  const accepted = new Set(ids);
  return sources.find((source) => source.type === 'window' && accepted.has(sourceNativeId(source) || ''));
}

function toCapturableWindow(record: NativeWindowRecord, source: CaptureSource): CapturableWindow {
  return {
    sourceId: source.id,
    sourceName: source.name || record.title || record.ownerName || 'Application Window',
    nativeWindowId: sourceNativeId(source) || record.id,
    appName: record.ownerName || 'Application',
    ownerPid: record.ownerPid,
    bounds: record.bounds,
    thumbnail: source.thumbnail,
    appIcon: source.appIcon,
  };
}

export function parseMacWindowList(
  stdout: string,
  sources: CaptureSource[],
  ownPid: number,
): CapturableWindow[] {
  const records = safeJsonArray(stdout);
  const windows: CapturableWindow[] = [];

  for (const candidate of records) {
    if (!candidate || typeof candidate !== 'object') continue;
    const value = candidate as Record<string, unknown>;
    const boundsValue = value.bounds as Record<string, unknown> | undefined;
    const id = finite(value.id) ? String(Math.trunc(value.id)) : '';
    const ownerPid = finite(value.ownerPid) ? Math.trunc(value.ownerPid) : undefined;
    const layer = finite(value.layer) ? value.layer : -1;
    const alpha = finite(value.alpha) ? value.alpha : 0;
    const bounds = {
      x: finite(boundsValue?.X) ? Math.round(boundsValue.X) : Number.NaN,
      y: finite(boundsValue?.Y) ? Math.round(boundsValue.Y) : Number.NaN,
      width: finite(boundsValue?.Width) ? Math.round(boundsValue.Width) : 0,
      height: finite(boundsValue?.Height) ? Math.round(boundsValue.Height) : 0,
    };

    if (!id || ownerPid === ownPid || layer !== 0 || alpha <= 0 || value.onScreen === false
      || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)
      || bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }

    const source = matchSource(sources, [id]);
    if (!source || source.id.endsWith(':1')) continue;
    windows.push(toCapturableWindow({
      id,
      ownerPid,
      ownerName: typeof value.ownerName === 'string' ? value.ownerName : '',
      title: typeof value.title === 'string' ? value.title : '',
      bounds,
    }, source));
  }

  return windows;
}

export function parseWindowsWindowList(
  stdout: string,
  sources: CaptureSource[],
  ownPid: number,
): CapturableWindow[] {
  const records = safeJsonArray(stdout);
  const windows: CapturableWindow[] = [];

  for (const candidate of records) {
    if (!candidate || typeof candidate !== 'object') continue;
    const value = candidate as Record<string, unknown>;
    const id = typeof value.handle === 'string' ? value.handle : finite(value.handle) ? String(value.handle) : '';
    const ownerPid = finite(value.pid) ? Math.trunc(value.pid) : undefined;
    const bounds = {
      x: finite(value.x) ? Math.round(value.x) : Number.NaN,
      y: finite(value.y) ? Math.round(value.y) : Number.NaN,
      width: finite(value.width) ? Math.round(value.width) : 0,
      height: finite(value.height) ? Math.round(value.height) : 0,
    };

    if (!id || ownerPid === ownPid || value.visible === false || value.cloaked === true
      || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)
      || bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }

    const source = matchSource(sources, [id]);
    if (!source || source.id.endsWith(':1')) continue;
    windows.push(toCapturableWindow({
      id,
      ownerPid,
      ownerName: typeof value.appName === 'string' ? value.appName : '',
      title: typeof value.title === 'string' ? value.title : '',
      bounds,
    }, source));
  }

  return windows;
}

export function parseX11WindowList(
  stdout: string,
  sources: CaptureSource[],
  ownPid: number,
  stackingOutput?: string,
): CapturableWindow[] {
  const windows: CapturableWindow[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const columns = line.split(/\s+/);
    if (columns.length < 10) continue;
    const hexId = columns[0];
    const decimalId = Number.parseInt(hexId, 16);
    const ownerPid = Number.parseInt(columns[2], 10);
    const x = Number.parseInt(columns[3], 10);
    const y = Number.parseInt(columns[4], 10);
    const width = Number.parseInt(columns[5], 10);
    const height = Number.parseInt(columns[6], 10);
    if (![decimalId, ownerPid, x, y, width, height].every(Number.isFinite)
      || ownerPid === ownPid || width <= 0 || height <= 0) {
      continue;
    }

    const source = matchSource(sources, [String(decimalId), hexId, hexId.toLowerCase()]);
    if (!source || source.id.endsWith(':1')) continue;
    const wmClass = columns[8];
    const appName = (wmClass.split('.')[0] || 'Application').replace(/^-+/, '');
    windows.push(toCapturableWindow({
      id: String(decimalId),
      ownerPid,
      ownerName: appName,
      title: columns.slice(9).join(' '),
      bounds: { x, y, width, height },
    }, source));
  }
  if (stackingOutput === undefined) return windows;

  // EWMH lists clients from bottom to top. Reverse it so findWindowAtPoint
  // sees front-most windows first, and omit anything without authoritative
  // stacking metadata rather than guessing from wmctrl output order.
  const frontToBackIds = (stackingOutput.match(/0x[0-9a-f]+/gi) || [])
    .map((id) => String(Number.parseInt(id, 16)))
    .filter((id) => id !== 'NaN')
    .reverse();
  const byNativeId = new Map(windows.map((window) => [window.nativeWindowId, window]));
  return frontToBackIds.flatMap((id) => {
    const window = byNativeId.get(id);
    return window ? [window] : [];
  });
}

export class WindowGeometryProvider {
  private readonly platform: NodeJS.Platform;
  private readonly ownPid: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly execFile: ExecFileLike;

  constructor(options: ProviderOptions = {}) {
    this.platform = options.platform || process.platform;
    this.ownPid = options.ownPid ?? process.pid;
    this.env = options.env || process.env;
    this.execFile = options.execFile || (nodeExecFile as unknown as ExecFileLike);
  }

  async listWindows(sources: CaptureSource[]): Promise<CapturableWindow[]> {
    if (this.platform === 'darwin') {
      const stdout = await this.run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_WINDOW_LIST_JXA]);
      return stdout === null ? [] : parseMacWindowList(stdout, sources, this.ownPid);
    }

    if (this.platform === 'win32') {
      const stdout = await this.run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_WINDOW_LIST_POWERSHELL,
      ]);
      return stdout === null ? [] : parseWindowsWindowList(stdout, sources, this.ownPid);
    }

    if (this.platform === 'linux' && (this.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'wayland') {
      const stacking = await this.run('xprop', ['-root', '_NET_CLIENT_LIST_STACKING']);
      if (stacking === null) return [];
      const stdout = await this.run('wmctrl', ['-lGpx']);
      return stdout === null ? [] : parseX11WindowList(stdout, sources, this.ownPid, stacking);
    }

    return [];
  }

  private run(file: string, args: readonly string[]): Promise<string | null> {
    const env: NodeJS.ProcessEnv = {
      PATH: this.env.PATH,
      HOME: this.env.HOME,
      USERPROFILE: this.env.USERPROFILE,
      LANG: this.env.LANG,
      TMPDIR: this.env.TMPDIR,
      TEMP: this.env.TEMP,
      XDG_SESSION_TYPE: this.env.XDG_SESSION_TYPE,
      DISPLAY: this.env.DISPLAY,
      SystemRoot: this.env.SystemRoot,
      ComSpec: this.env.ComSpec,
      PATHEXT: this.env.PATHEXT,
    };

    return new Promise((resolve) => {
      this.execFile(file, args, {
        env,
        timeout: PROCESS_TIMEOUT_MS,
        maxBuffer: PROCESS_MAX_BUFFER,
        windowsHide: true,
      }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.toString());
      });
    });
  }
}

export const windowGeometryProvider = new WindowGeometryProvider();
