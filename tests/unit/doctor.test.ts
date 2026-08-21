/**
 * Doctor Command Unit Tests
 *
 * Tests the environment health check functionality:
 * - Node.js version check
 * - ffmpeg / ffprobe availability
 * - Whisper model detection
 * - API key checks
 * - Disk space check
 * - Overall result aggregation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const {
  mockExecFile,
  mockExistsSync,
  mockStat,
} = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockExistsSync: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFile,
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: mockExistsSync,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
}));

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  homedir: () => '/home/testuser',
  platform: () => 'darwin',
}));

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import { runDoctorChecks, type DoctorResult } from '../../src/cli/doctor';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Set up execFile mock to handle commands asynchronously.
 */
function mockExecFileHandler(
  handler: (cmd: string, args: string[]) => { error: Error | null; stdout: string; stderr: string },
) {
  mockExecFile.mockImplementation((...callArgs: unknown[]) => {
    const cmd = callArgs[0] as string;
    const cmdArgs = callArgs[1] as string[];
    const callback = callArgs[callArgs.length - 1] as (
      err: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    const result = handler(cmd, cmdArgs);
    process.nextTick(() => callback(result.error, result.stdout, result.stderr));
    return { kill: vi.fn(), pid: 1 };
  });
}

function findCheck(result: DoctorResult, name: string) {
  return result.checks.find((c) => c.name === name);
}

// ============================================================================
// Tests
// ============================================================================

describe('doctor', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockExistsSync.mockReset();
    mockStat.mockReset();
    // Default: no env vars set
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  // --------------------------------------------------------------------------
  // Node.js version
  // --------------------------------------------------------------------------

  describe('Node.js version check', () => {
    it('passes when Node.js >= 18', async () => {
      // process.version is read-only, but the check uses it directly.
      // In test, Node.js is always >= 18, so this should always pass.
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Node.js');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
      expect(check!.message).toContain('>= 18.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // ffmpeg check
  // --------------------------------------------------------------------------

  describe('ffmpeg check', () => {
    it('passes when ffmpeg is installed', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffmpeg') {
          return { error: null, stdout: 'ffmpeg version 6.1.1 Copyright', stderr: '' };
        }
        if (cmd === 'ffprobe') {
          return { error: null, stdout: 'ffprobe version 6.1.1', stderr: '' };
        }
        if (cmd === 'df') {
          return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'ffmpeg');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
      expect(check!.message).toContain('6.1.1');
    });

    it('fails when ffmpeg is not installed', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffmpeg') {
          return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        }
        if (cmd === 'ffprobe') {
          return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        }
        if (cmd === 'df') {
          return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'ffmpeg');

      expect(check).toBeDefined();
      expect(check!.status).toBe('fail');
      expect(check!.hint).toContain('brew install ffmpeg');
    });
  });

  // --------------------------------------------------------------------------
  // ffprobe check
  // --------------------------------------------------------------------------

  describe('ffprobe check', () => {
    it('passes when ffprobe is installed', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffprobe') {
          return { error: null, stdout: 'ffprobe version 6.1.1', stderr: '' };
        }
        if (cmd === 'ffmpeg') {
          return { error: null, stdout: 'ffmpeg version 6.1.1', stderr: '' };
        }
        if (cmd === 'df') {
          return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'ffprobe');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
    });

    it('fails when ffprobe is not installed', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffprobe') {
          return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        }
        if (cmd === 'ffmpeg') {
          return { error: null, stdout: 'ffmpeg version 6.1.1', stderr: '' };
        }
        if (cmd === 'df') {
          return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'ffprobe');

      expect(check).toBeDefined();
      expect(check!.status).toBe('fail');
    });
  });

  // --------------------------------------------------------------------------
  // Whisper model check
  // --------------------------------------------------------------------------

  describe('Whisper model check', () => {
    it('passes when a model file exists', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffmpeg') return { error: null, stdout: 'ffmpeg version 6.1.1', stderr: '' };
        if (cmd === 'ffprobe') return { error: null, stdout: 'ffprobe version 6.1.1', stderr: '' };
        if (cmd === 'df') return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockImplementation((path: string) => {
        // Models directory exists
        if (path.includes('whisper-models') && !path.includes('.bin')) return true;
        // ggml-base.bin exists
        if (path.includes('ggml-base.bin')) return true;
        return false;
      });
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Whisper model');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
      expect(check!.message).toContain('ggml-base.bin');
    });

    it('warns when no model is found', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'ffmpeg') return { error: null, stdout: 'ffmpeg version 6.1.1', stderr: '' };
        if (cmd === 'ffprobe') return { error: null, stdout: 'ffprobe version 6.1.1', stderr: '' };
        if (cmd === 'df') return { error: null, stdout: 'Filesystem 1K Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /', stderr: '' };
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Whisper model');

      expect(check).toBeDefined();
      expect(check!.status).toBe('warn');
      expect(check!.hint).toContain('MarkuprPlus desktop app');
      expect(check!.hint).not.toContain('MarkuprX');
    });
  });

  // --------------------------------------------------------------------------
  // API key checks
  // --------------------------------------------------------------------------

  describe('API key checks', () => {
    it('passes when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Anthropic API key');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
      expect(check!.message).toContain('sk-ant-');
    });

    it('warns when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Anthropic API key');

      expect(check).toBeDefined();
      expect(check!.status).toBe('warn');
    });

    it('passes when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-openai';
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'OpenAI API key');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
    });

    it('warns when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'OpenAI API key');

      expect(check).toBeDefined();
      expect(check!.status).toBe('warn');
    });
  });

  // --------------------------------------------------------------------------
  // Disk space check
  // --------------------------------------------------------------------------

  describe('disk space check', () => {
    it('passes when sufficient disk space is available', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'df') {
          return {
            error: null,
            stdout: 'Filesystem 1K-blocks Used Available Use% Mounted\n/dev/disk 100000000 50000000 50000000 50% /',
            stderr: '',
          };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Disk space');

      expect(check).toBeDefined();
      expect(check!.status).toBe('pass');
      expect(check!.message).toContain('GB available');
    });

    it('warns when disk space is low', async () => {
      mockExecFileHandler((cmd) => {
        if (cmd === 'df') {
          // ~500MB available (512000 KB)
          return {
            error: null,
            stdout: 'Filesystem 1K-blocks Used Available Use% Mounted\n/dev/disk 100000000 99488000 512000 99% /',
            stderr: '',
          };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();
      const check = findCheck(result, 'Disk space');

      expect(check).toBeDefined();
      expect(check!.status).toBe('warn');
      expect(check!.message).toContain('low');
      expect(check!.hint).toContain('MarkuprPlus recordings and output');
      expect(check!.hint).not.toContain('MarkuprX');
    });
  });

  // --------------------------------------------------------------------------
  // Result aggregation
  // --------------------------------------------------------------------------

  describe('result aggregation', () => {
    it('counts passes, warnings, and failures correctly', async () => {
      mockExecFileHandler((cmd) => {
        // ffmpeg/ffprobe fail, df succeeds
        if (cmd === 'ffmpeg') return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        if (cmd === 'ffprobe') return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        if (cmd === 'df') {
          return {
            error: null,
            stdout: 'Filesystem 1K-blocks Used Available Use%\n/dev/disk 100000000 50000000 50000000 50% /',
            stderr: '',
          };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();

      // Should have 7 checks total
      expect(result.checks).toHaveLength(7);
      expect(result.passed + result.warned + result.failed).toBe(7);
      // ffmpeg + ffprobe should fail
      expect(result.failed).toBeGreaterThanOrEqual(2);
    });

    it('returns all 7 checks', async () => {
      mockExecFileHandler(() => ({ error: null, stdout: '', stderr: '' }));
      mockExistsSync.mockReturnValue(false);
      mockStat.mockResolvedValue({});

      const result = await runDoctorChecks();

      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames).toContain('Node.js');
      expect(checkNames).toContain('ffmpeg');
      expect(checkNames).toContain('ffprobe');
      expect(checkNames).toContain('Whisper model');
      expect(checkNames).toContain('Anthropic API key');
      expect(checkNames).toContain('OpenAI API key');
      expect(checkNames).toContain('Disk space');
    });
  });
});
