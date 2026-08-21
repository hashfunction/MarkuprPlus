/**
 * DeviceDetector Unit Tests
 *
 * Tests parsing of ffmpeg avfoundation device list output:
 * - Correct parsing of video devices
 * - Correct parsing of audio devices
 * - Handling of mixed/interleaved output
 * - Empty device lists
 * - Malformed output handling
 * - Error when ffmpeg doesn't return AVFoundation output
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockExecFileCb } = vi.hoisted(() => ({
  mockExecFileCb: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFileCb,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import { detectDevices, parseDeviceList } from '../../../src/mcp/capture/DeviceDetector.js';

describe('DeviceDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseDeviceList', () => {
    const SAMPLE_OUTPUT = [
      '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation video devices:',
      '[AVFoundation indev @ 0x7f8b8c000000] [0] Capture screen 0',
      '[AVFoundation indev @ 0x7f8b8c000000] [1] Capture screen 1',
      '[AVFoundation indev @ 0x7f8b8c000000] [2] FaceTime HD Camera',
      '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation audio devices:',
      '[AVFoundation indev @ 0x7f8b8c000000] [0] MacBook Pro Microphone',
      '[AVFoundation indev @ 0x7f8b8c000000] [1] External Microphone',
    ].join('\n');

    it('parses video devices correctly', () => {
      const result = parseDeviceList(SAMPLE_OUTPUT);
      expect(result.video).toHaveLength(3);
      expect(result.video[0]).toEqual({ index: 0, name: 'Capture screen 0' });
      expect(result.video[1]).toEqual({ index: 1, name: 'Capture screen 1' });
      expect(result.video[2]).toEqual({ index: 2, name: 'FaceTime HD Camera' });
    });

    it('parses audio devices correctly', () => {
      const result = parseDeviceList(SAMPLE_OUTPUT);
      expect(result.audio).toHaveLength(2);
      expect(result.audio[0]).toEqual({ index: 0, name: 'MacBook Pro Microphone' });
      expect(result.audio[1]).toEqual({ index: 1, name: 'External Microphone' });
    });

    it('returns empty arrays for output with no devices', () => {
      const noDevices = [
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation video devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation audio devices:',
      ].join('\n');

      const result = parseDeviceList(noDevices);
      expect(result.video).toHaveLength(0);
      expect(result.audio).toHaveLength(0);
    });

    it('returns empty arrays for completely empty input', () => {
      const result = parseDeviceList('');
      expect(result.video).toHaveLength(0);
      expect(result.audio).toHaveLength(0);
    });

    it('handles output with only video devices', () => {
      const videoOnly = [
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation video devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] [0] Capture screen 0',
      ].join('\n');

      const result = parseDeviceList(videoOnly);
      expect(result.video).toHaveLength(1);
      expect(result.audio).toHaveLength(0);
    });

    it('handles output with only audio devices', () => {
      const audioOnly = [
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation audio devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] [0] Built-in Microphone',
      ].join('\n');

      const result = parseDeviceList(audioOnly);
      expect(result.video).toHaveLength(0);
      expect(result.audio).toHaveLength(1);
      expect(result.audio[0]).toEqual({ index: 0, name: 'Built-in Microphone' });
    });

    it('ignores non-device lines in output', () => {
      const withNoise = [
        'ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers',
        '  built with Apple clang version 15.0.0',
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation video devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] [0] Screen 0',
        'some random noise line',
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation audio devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] [0] Mic',
      ].join('\n');

      const result = parseDeviceList(withNoise);
      expect(result.video).toHaveLength(1);
      expect(result.audio).toHaveLength(1);
    });

    it('trims device names', () => {
      const withSpaces = [
        '[AVFoundation indev @ 0x7f8b8c000000] AVFoundation video devices:',
        '[AVFoundation indev @ 0x7f8b8c000000] [0]   Capture screen 0  ',
      ].join('\n');

      const result = parseDeviceList(withSpaces);
      expect(result.video[0].name).toBe('Capture screen 0');
    });
  });

  describe('detectDevices', () => {
    it('rejects when ffmpeg does not return AVFoundation output', async () => {
      mockExecFileCb.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: Function) => {
          cb(null, '', 'no relevant output');
        },
      );

      await expect(detectDevices()).rejects.toThrow('AVFoundation');
    });

    it('resolves with parsed devices on valid output', async () => {
      const validOutput = [
        '[AVFoundation indev @ 0x7f] AVFoundation video devices:',
        '[AVFoundation indev @ 0x7f] [0] Screen',
        '[AVFoundation indev @ 0x7f] AVFoundation audio devices:',
        '[AVFoundation indev @ 0x7f] [0] Mic',
      ].join('\n');

      mockExecFileCb.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: Function) => {
          cb(new Error('exit 1'), '', validOutput);
        },
      );

      const result = await detectDevices();
      expect(result.video).toHaveLength(1);
      expect(result.audio).toHaveLength(1);
    });
  });
});
