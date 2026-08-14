import * as os from 'os';
import { execFileSync } from 'child_process';

export interface MemorySnapshot {
  platform: NodeJS.Platform;
  freeMemoryBytes: number;
  totalMemoryBytes: number;
  memoryPressureOutput?: string;
}

/**
 * Node's os.freemem() on macOS excludes reclaimable inactive and cached pages,
 * so it can report only a few megabytes on an otherwise healthy system.
 * memory_pressure reports the percentage macOS can make available safely.
 */
export function resolveAvailableMemoryBytes(snapshot: MemorySnapshot): number {
  if (snapshot.platform !== 'darwin' || !snapshot.memoryPressureOutput) {
    return snapshot.freeMemoryBytes;
  }

  const match = snapshot.memoryPressureOutput.match(
    /System-wide memory free percentage:\s*([0-9]+(?:\.[0-9]+)?)%/i,
  );
  const percentage = match ? Number.parseFloat(match[1]) : Number.NaN;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return snapshot.freeMemoryBytes;
  }

  const pressureAvailableBytes = snapshot.totalMemoryBytes * (percentage / 100);
  return Math.max(snapshot.freeMemoryBytes, pressureAvailableBytes);
}

export function getAvailableMemoryBytes(): number {
  const freeMemoryBytes = os.freemem();
  const totalMemoryBytes = os.totalmem();
  let memoryPressureOutput: string | undefined;

  if (process.platform === 'darwin') {
    try {
      memoryPressureOutput = execFileSync('/usr/bin/memory_pressure', [], {
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 256 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // Fall back to os.freemem() if the system utility is unavailable.
    }
  }

  return resolveAvailableMemoryBytes({
    platform: process.platform,
    freeMemoryBytes,
    totalMemoryBytes,
    memoryPressureOutput,
  });
}
