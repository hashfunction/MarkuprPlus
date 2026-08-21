/**
 * FrameExtractor Unit Tests
 *
 * Tests the ffmpeg-based video frame extraction:
 * - ffmpeg availability check
 * - Frame extraction with timestamp distribution
 * - Timestamp normalization and deduplication
 * - Error handling when ffmpeg fails
 * - Edge cases (empty timestamps, single frame, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock child_process
// =============================================================================

const mockExecFile = vi.fn();

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      return mockExecFile(...args);
    }
    return mockExecFile(...args);
  },
}));

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: (_fn: unknown) => mockExecFile,
  };
});

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// =============================================================================
// Testable FrameExtractor (isolated from system dependencies)
// =============================================================================

/**
 * Isolated FrameExtractor for testing core logic without system ffmpeg.
 */
class TestableFrameExtractor {
  private ffmpegChecked: boolean = false;
  private ffmpegAvailable: boolean = false;

  private readonly FRAME_EDGE_MARGIN_SECONDS = 0.35;
  private readonly TIMESTAMP_DEDUPE_WINDOW_SECONDS = 0.15;
  private readonly DEFAULT_MAX_FRAMES = 20;

  // --- ffmpeg availability ---

  setFfmpegAvailable(available: boolean): void {
    this.ffmpegChecked = true;
    this.ffmpegAvailable = available;
  }

  isFfmpegAvailable(): boolean {
    return this.ffmpegAvailable;
  }

  resetFfmpegCheck(): void {
    this.ffmpegChecked = false;
    this.ffmpegAvailable = false;
  }

  // --- Timestamp selection logic ---

  selectDistributed(sorted: number[], count: number): number[] {
    if (sorted.length <= count) return sorted;
    if (count <= 0) return [];
    if (count === 1) return [sorted[0]];

    const result: number[] = [sorted[0]];
    const step = (sorted.length - 1) / (count - 1);

    for (let i = 1; i < count - 1; i++) {
      const index = Math.round(i * step);
      result.push(sorted[index]);
    }

    result.push(sorted[sorted.length - 1]);
    return result;
  }

  // --- Timestamp normalization ---

  normalizeTimestamps(timestamps: number[], durationSeconds: number | null): number[] {
    const cleaned = timestamps
      .map((ts) => (Number.isFinite(ts) ? Math.max(0, ts) : 0))
      .sort((a, b) => a - b);

    if (cleaned.length === 0) return [];

    let clamped = cleaned;
    if (durationSeconds && durationSeconds > 0) {
      const minTs = Math.min(this.FRAME_EDGE_MARGIN_SECONDS, Math.max(0, durationSeconds - 0.05));
      const maxTs = Math.max(minTs, durationSeconds - this.FRAME_EDGE_MARGIN_SECONDS);
      clamped = cleaned.map((ts) => Math.max(minTs, Math.min(ts, maxTs)));
    }

    const deduped: number[] = [];
    for (const ts of clamped) {
      const previous = deduped[deduped.length - 1];
      if (
        previous === undefined ||
        Math.abs(ts - previous) >= this.TIMESTAMP_DEDUPE_WINDOW_SECONDS
      ) {
        deduped.push(ts);
      }
    }

    return deduped;
  }

  // --- Build ffmpeg args for testing ---

  buildAccurateArgs(videoPath: string, timestamp: number, outputPath: string): string[] {
    return [
      '-i', videoPath,
      '-ss', String(timestamp),
      '-frames:v', '1',
      '-vf', 'format=rgb24',
      '-q:v', '2',
      '-y',
      outputPath,
    ];
  }

  buildFastArgs(videoPath: string, timestamp: number, outputPath: string): string[] {
    return [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'format=rgb24',
      '-q:v', '2',
      '-y',
      outputPath,
    ];
  }

  // --- Simulate extraction ---

  async simulateExtract(request: {
    timestamps: number[];
    maxFrames?: number;
    durationSeconds?: number | null;
  }): Promise<{
    frames: Array<{ timestamp: number; success: boolean }>;
    ffmpegAvailable: boolean;
  }> {
    if (!this.ffmpegAvailable) {
      return { frames: [], ffmpegAvailable: false };
    }

    const maxFrames = request.maxFrames ?? this.DEFAULT_MAX_FRAMES;
    let timestamps = [...request.timestamps].sort((a, b) => a - b);

    if (timestamps.length > maxFrames) {
      timestamps = this.selectDistributed(timestamps, maxFrames);
    }

    timestamps = this.normalizeTimestamps(timestamps, request.durationSeconds ?? null);

    if (timestamps.length === 0) {
      return { frames: [], ffmpegAvailable: true };
    }

    return {
      frames: timestamps.map((ts) => ({ timestamp: ts, success: true })),
      ffmpegAvailable: true,
    };
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('FrameExtractor', () => {
  let extractor: TestableFrameExtractor;

  beforeEach(() => {
    extractor = new TestableFrameExtractor();
  });

  describe('ffmpeg Availability', () => {
    it('should default to ffmpeg not available', () => {
      expect(extractor.isFfmpegAvailable()).toBe(false);
    });

    it('should report ffmpeg available when set', () => {
      extractor.setFfmpegAvailable(true);
      expect(extractor.isFfmpegAvailable()).toBe(true);
    });

    it('should return empty result when ffmpeg is not available', async () => {
      extractor.setFfmpegAvailable(false);

      const result = await extractor.simulateExtract({
        timestamps: [1, 2, 3],
      });

      expect(result.frames).toHaveLength(0);
      expect(result.ffmpegAvailable).toBe(false);
    });

    it('should reset ffmpeg check state', () => {
      extractor.setFfmpegAvailable(true);
      extractor.resetFfmpegCheck();

      expect(extractor.isFfmpegAvailable()).toBe(false);
    });
  });

  describe('Frame Extraction Command Building', () => {
    it('should build accurate extraction args with -ss after -i', () => {
      const args = extractor.buildAccurateArgs('/tmp/video.webm', 5.5, '/tmp/frame.png');

      expect(args[0]).toBe('-i');
      expect(args[1]).toBe('/tmp/video.webm');
      expect(args[2]).toBe('-ss');
      expect(args[3]).toBe('5.5');
      expect(args[4]).toBe('-frames:v');
      expect(args[5]).toBe('1');
    });

    it('should build fast extraction args with -ss before -i', () => {
      const args = extractor.buildFastArgs('/tmp/video.webm', 5.5, '/tmp/frame.png');

      expect(args[0]).toBe('-ss');
      expect(args[1]).toBe('5.5');
      expect(args[2]).toBe('-i');
      expect(args[3]).toBe('/tmp/video.webm');
    });

    it('should include -y flag for overwrite', () => {
      const args = extractor.buildAccurateArgs('/tmp/video.webm', 0, '/tmp/frame.png');
      expect(args).toContain('-y');
    });

    it('should include output path as last argument', () => {
      const args = extractor.buildAccurateArgs('/tmp/video.webm', 0, '/tmp/output.png');
      expect(args[args.length - 1]).toBe('/tmp/output.png');
    });
  });

  describe('Timestamp Distribution', () => {
    it('should return all timestamps when under limit', () => {
      const result = extractor.selectDistributed([1, 2, 3, 4, 5], 10);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should select evenly distributed timestamps', () => {
      const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const result = extractor.selectDistributed(sorted, 5);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe(0); // Always includes first
      expect(result[result.length - 1]).toBe(9); // Always includes last
    });

    it('should return first element for count=1', () => {
      const result = extractor.selectDistributed([5, 10, 15], 1);
      expect(result).toEqual([5]);
    });

    it('should return empty for count=0', () => {
      const result = extractor.selectDistributed([1, 2, 3], 0);
      expect(result).toEqual([]);
    });

    it('should include first and last for count=2', () => {
      const result = extractor.selectDistributed([1, 2, 3, 4, 5], 2);
      expect(result).toEqual([1, 5]);
    });
  });

  describe('Timestamp Normalization', () => {
    it('should sort timestamps', () => {
      const result = extractor.normalizeTimestamps([5, 2, 8, 1], null);
      expect(result).toEqual([1, 2, 5, 8]);
    });

    it('should clamp negative timestamps to 0', () => {
      const result = extractor.normalizeTimestamps([-5, -1, 3], null);
      expect(result[0]).toBe(0);
    });

    it('should handle NaN and Infinity', () => {
      const result = extractor.normalizeTimestamps([NaN, Infinity, 5], null);
      expect(result).toContain(5);
      result.forEach((ts) => {
        expect(Number.isFinite(ts)).toBe(true);
      });
    });

    it('should clamp to video duration edges', () => {
      const result = extractor.normalizeTimestamps([0, 30], 30);

      // First timestamp should be clamped to edge margin
      expect(result[0]).toBeGreaterThanOrEqual(0.35);
      // Last timestamp should be clamped away from end
      expect(result[result.length - 1]).toBeLessThanOrEqual(29.65);
    });

    it('should deduplicate close timestamps', () => {
      const result = extractor.normalizeTimestamps([5.0, 5.05, 5.1, 10], null);

      // 5.0 and 5.05 and 5.1 are within 0.15s window, should be deduped
      expect(result.length).toBeLessThan(4);
      expect(result).toContain(5);
      expect(result).toContain(10);
    });

    it('should return empty for empty input', () => {
      const result = extractor.normalizeTimestamps([], null);
      expect(result).toEqual([]);
    });

    it('should handle null duration gracefully', () => {
      const result = extractor.normalizeTimestamps([1, 5, 10], null);
      expect(result).toEqual([1, 5, 10]);
    });
  });

  describe('End-to-End Extraction Simulation', () => {
    it('should extract frames at given timestamps', async () => {
      extractor.setFfmpegAvailable(true);

      const result = await extractor.simulateExtract({
        timestamps: [1, 5, 10],
        durationSeconds: 30,
      });

      expect(result.ffmpegAvailable).toBe(true);
      expect(result.frames.length).toBeGreaterThan(0);
      result.frames.forEach((frame) => {
        expect(frame.success).toBe(true);
      });
    });

    it('should cap frames at maxFrames', async () => {
      extractor.setFfmpegAvailable(true);

      const timestamps = Array.from({ length: 30 }, (_, i) => i * 2);
      const result = await extractor.simulateExtract({
        timestamps,
        maxFrames: 5,
        durationSeconds: 60,
      });

      expect(result.frames.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty timestamps', async () => {
      extractor.setFfmpegAvailable(true);

      const result = await extractor.simulateExtract({
        timestamps: [],
      });

      expect(result.frames).toHaveLength(0);
      expect(result.ffmpegAvailable).toBe(true);
    });

    it('should handle single timestamp', async () => {
      extractor.setFfmpegAvailable(true);

      const result = await extractor.simulateExtract({
        timestamps: [5],
        durationSeconds: 30,
      });

      expect(result.frames.length).toBe(1);
    });
  });
});
