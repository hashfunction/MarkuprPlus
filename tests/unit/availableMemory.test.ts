import { describe, expect, it } from 'vitest';
import { resolveAvailableMemoryBytes } from '../../src/main/system/AvailableMemory';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('available memory resolution', () => {
  it('uses macOS memory pressure instead of only free pages', () => {
    expect(resolveAvailableMemoryBytes({
      platform: 'darwin',
      freeMemoryBytes: 64 * MB,
      totalMemoryBytes: 16 * GB,
      memoryPressureOutput: 'System-wide memory free percentage: 42%',
    })).toBeCloseTo(16 * GB * 0.42, 0);
  });

  it('never reports less than the operating system free-memory value', () => {
    expect(resolveAvailableMemoryBytes({
      platform: 'darwin',
      freeMemoryBytes: 2 * GB,
      totalMemoryBytes: 16 * GB,
      memoryPressureOutput: 'System-wide memory free percentage: 1%',
    })).toBe(2 * GB);
  });

  it('falls back to free memory when macOS pressure output is unavailable', () => {
    expect(resolveAvailableMemoryBytes({
      platform: 'darwin',
      freeMemoryBytes: 512 * MB,
      totalMemoryBytes: 16 * GB,
      memoryPressureOutput: 'unexpected output',
    })).toBe(512 * MB);
  });

  it('uses the native free-memory value on other platforms', () => {
    expect(resolveAvailableMemoryBytes({
      platform: 'linux',
      freeMemoryBytes: 3 * GB,
      totalMemoryBytes: 16 * GB,
      memoryPressureOutput: 'System-wide memory free percentage: 42%',
    })).toBe(3 * GB);
  });
});
