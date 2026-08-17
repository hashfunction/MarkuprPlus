import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createReviewExportDestination,
  prepareReviewExportDestination,
  runReviewExportInPrivateDirectory,
  sanitizeReviewExportOptions,
  trustedReviewExportSession,
} from '../../src/main/output/ReviewExportRequest';
import type { ReviewSession } from '../../src/shared/types';

function reviewSession(): ReviewSession {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_005_000,
    feedbackItems: [{
      id: 'feedback-1',
      transcription: 'The checkout action needs a clearer focus treatment.',
      timestamp: 1_700_000_001_000,
      screenshots: [{
        id: 'screenshot-1',
        timestamp: 1_700_000_001_000,
        imagePath: '../../renderer-chosen-secret.png',
        base64: 'renderer-chosen-base64',
        width: 1280,
        height: 720,
      }],
      category: 'UX Issue',
      severity: 'High',
    }],
    metadata: {
      os: 'darwin',
      sourceName: 'Checkout Review',
      sourceType: 'window',
    },
  };
}

function markedReviewItem(): ReviewSession['feedbackItems'][number] {
  return {
    id: 'marked-issue-1',
    transcription: 'The marked checkout evidence needs stronger contrast.',
    timestamp: 1_700_000_002_000,
    screenshots: [{
      id: 'marked-issue-1-evidence',
      timestamp: 1_700_000_002_000,
      imagePath: '/renderer-selected/marked.png',
      base64: 'renderer-selected-marked-base64',
      width: 960,
      height: 540,
    }],
    reviewItemKind: 'marked-issue',
    markedIssueOrdinal: 1,
    category: 'UX Issue',
    severity: 'Medium',
  };
}

describe('review export request security', () => {
  it('allowlists and bounds every renderer-controlled option', () => {
    expect(sanitizeReviewExportOptions({
      format: 'html',
      projectName: '  Checkout Review  ',
      includeImages: false,
      theme: 'light',
    })).toEqual({
      format: 'html',
      projectName: 'Checkout Review',
      includeImages: false,
      theme: 'light',
    });

    for (const invalid of [
      { format: 'exe', projectName: 'Review', includeImages: true, theme: 'dark' },
      { format: 'html', projectName: 'x'.repeat(121), includeImages: true, theme: 'dark' },
      { format: 'html', projectName: 'Review', includeImages: 'yes', theme: 'dark' },
      { format: 'html', projectName: 'Review', includeImages: true, theme: 'system' },
    ]) {
      expect(() => sanitizeReviewExportOptions(invalid)).toThrow(/export/i);
    }
  });

  it('rejects unfinished or empty sessions and keeps JSON evidence metadata-only', async () => {
    const unfinished = reviewSession();
    delete unfinished.endTime;
    await expect(Promise.resolve().then(() => trustedReviewExportSession(unfinished, {
      mainOwnedSession: null,
      sessionDirectory: null,
      outputRoot: '/not-read-for-json',
      format: 'json',
      includeImages: true,
    }))).rejects.toThrow(/completed/i);

    const empty = reviewSession();
    empty.feedbackItems = [];
    await expect(Promise.resolve().then(() => trustedReviewExportSession(empty, {
      mainOwnedSession: null,
      sessionDirectory: null,
      outputRoot: '/not-read-for-json',
      format: 'json',
      includeImages: true,
    }))).rejects.toThrow(/feedback/i);

    const metadataOnly = await trustedReviewExportSession(reviewSession(), {
      mainOwnedSession: reviewSession(),
      sessionDirectory: null,
      outputRoot: '/not-read-for-json',
      format: 'json',
      includeImages: true,
    });
    expect(metadataOnly.feedbackItems[0].screenshots[0]).toMatchObject({
      id: 'screenshot-1',
      imagePath: '',
    });
    expect(metadataOnly.feedbackItems[0].screenshots[0].base64).toBeUndefined();
  });

  it('allowlists source types and omits malformed structured-clone values', async () => {
    for (const sourceType of ['screen', 'window', 'region'] as const) {
      const input = reviewSession();
      input.metadata!.sourceType = sourceType;
      const sanitized = await trustedReviewExportSession(input, {
        mainOwnedSession: null,
        sessionDirectory: null,
        outputRoot: '/not-read-for-json',
        format: 'json',
        includeImages: false,
      });
      expect(sanitized.metadata?.sourceType).toBe(sourceType);
    }

    for (const sourceType of ['display', { type: 'window' }, ['screen'], 42, true]) {
      const input = reviewSession();
      input.metadata!.sourceType = sourceType as never;
      const sanitized = await trustedReviewExportSession(input, {
        mainOwnedSession: null,
        sessionDirectory: null,
        outputRoot: '/not-read-for-json',
        format: 'json',
        includeImages: false,
      });
      expect(sanitized.metadata?.sourceType).toBeUndefined();
    }
  });

  it('hydrates ordinary and marked bytes only from identity-matched main-owned evidence', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const markedBytes = Buffer.from('main-owned-marked-png');
    const ordinaryBytes = Buffer.from('main-owned-ordinary-png');
    try {
      await mkdir(join(sessionDirectory, 'screenshots'), { recursive: true });
      await writeFile(join(sessionDirectory, 'screenshots', 'marked-issue-001.png'), markedBytes);

      const rendererSession = reviewSession();
      rendererSession.feedbackItems.push(markedReviewItem());
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0] = {
        ...mainOwnedSession.feedbackItems[0].screenshots[0],
        imagePath: '',
        base64: ordinaryBytes.toString('base64'),
      };
      mainOwnedSession.feedbackItems.push({
        ...markedReviewItem(),
        screenshots: [{
          ...markedReviewItem().screenshots[0],
          imagePath: 'screenshots/marked-issue-001.png',
          base64: undefined,
        }],
      });

      const hydrated = await trustedReviewExportSession(rendererSession, {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'html',
        includeImages: true,
      });

      expect(hydrated.feedbackItems.map((item) => item.screenshots[0])).toEqual([
        expect.objectContaining({
          id: 'screenshot-1',
          imagePath: '',
          base64: ordinaryBytes.toString('base64'),
        }),
        expect.objectContaining({
          id: 'marked-issue-1-evidence',
          imagePath: '',
          base64: markedBytes.toString('base64'),
        }),
      ]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('hydrates an absolute main-owned image only when it remains inside the saved session', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const absoluteImage = join(sessionDirectory, 'screenshots', 'absolute.png');
    try {
      await mkdir(dirname(absoluteImage), { recursive: true });
      await writeFile(absoluteImage, 'absolute main-owned image');
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = absoluteImage;
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;

      const hydrated = await trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'html',
        includeImages: true,
      });

      expect(hydrated.feedbackItems[0].screenshots[0].base64)
        .toBe(Buffer.from('absolute main-owned image').toString('base64'));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each(['markdown', 'html', 'pdf'] as const)(
    'retains trusted screenshot metadata without reading files when %s images are disabled',
    async (format) => {
      const rendererSession = reviewSession();
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = '/missing/main-owned.png';
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;

      const withoutImages = await trustedReviewExportSession(rendererSession, {
        mainOwnedSession,
        sessionDirectory: '/missing/session-directory',
        outputRoot: '/missing/output-root',
        format,
        includeImages: false,
      });

      expect(withoutImages.feedbackItems[0].screenshots).toEqual([
        expect.objectContaining({
          id: 'screenshot-1',
          imagePath: '',
          base64: undefined,
        }),
      ]);
    },
  );

  it('rejects a main-owned screenshot symlink that resolves outside its saved session', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const outsideImage = join(fixtureRoot, 'outside.png');
    try {
      await mkdir(join(sessionDirectory, 'screenshots'), { recursive: true });
      await writeFile(outsideImage, 'outside evidence');
      await symlink(outsideImage, join(sessionDirectory, 'screenshots', 'unsafe.png'));
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = 'screenshots/unsafe.png';
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;

      await expect(Promise.resolve().then(() => trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'markdown',
        includeImages: true,
      }))).rejects.toThrow(/screenshot.*symbolic link|unsafe.*evidence/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects requested main-owned evidence that is unavailable', async () => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = '';
    mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;

    await expect(Promise.resolve().then(() => trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/missing/output-root',
      format: 'html',
      includeImages: true,
    }))).rejects.toThrow(/screenshot.*unavailable|evidence.*unavailable/i);
  });

  it('rejects an oversized main-owned evidence file before reading it', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const oversizedImage = join(sessionDirectory, 'screenshots', 'oversized.png');
    try {
      await mkdir(dirname(oversizedImage), { recursive: true });
      await writeFile(oversizedImage, '');
      await truncate(oversizedImage, 12 * 1024 * 1024 + 1);
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = 'screenshots/oversized.png';
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;

      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'markdown',
        includeImages: true,
      })).rejects.toThrow(/size limit/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('creates collision-safe destinations strictly beneath the configured output root', () => {
    const outputRoot = '/tmp/markuprx-output';
    const first = createReviewExportDestination(
      outputRoot,
      reviewSession(),
      { format: 'html', projectName: '../../Checkout / Review', includeImages: true, theme: 'dark' },
      'nonce-one',
    );
    const second = createReviewExportDestination(
      outputRoot,
      reviewSession(),
      { format: 'html', projectName: '../../Checkout / Review', includeImages: true, theme: 'dark' },
      'nonce-two',
    );

    expect(first).not.toBe(second);
    expect(resolve(first).startsWith(`${resolve(outputRoot)}/exports/`)).toBe(true);
    expect(first).toMatch(/checkout-review-feedback-\d{8}-\d{4}-nonce-one\.html$/);
    expect(first).not.toContain('..');
  });

  it('fails closed when the exports directory is a symlink outside the output root', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
    const outputRoot = join(fixtureRoot, 'output');
    const outsideRoot = join(fixtureRoot, 'outside');
    try {
      await mkdir(outputRoot);
      await mkdir(outsideRoot);
      await symlink(outsideRoot, join(outputRoot, 'exports'), 'dir');

      await expect(prepareReviewExportDestination(
        outputRoot,
        reviewSession(),
        { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
        'outside-symlink',
      )).rejects.toThrow(/export directory|output root/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a configured output root whose final path component is a symlink', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
    const realOutputRoot = join(fixtureRoot, 'real-output');
    const configuredOutputRoot = join(fixtureRoot, 'configured-output');
    try {
      await mkdir(realOutputRoot);
      await symlink(realOutputRoot, configuredOutputRoot, 'dir');

      await expect(prepareReviewExportDestination(
        configuredOutputRoot,
        reviewSession(),
        { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
        'root-symlink',
      )).rejects.toThrow(/output root.*symbolic link/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each(['html', 'markdown'] as const)(
    'allocates an exclusive private namespace for repeated %s preparations',
    async (format) => {
      const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
      const outputRoot = join(fixtureRoot, 'output');
      try {
        await mkdir(outputRoot);
        await chmod(outputRoot, 0o755);
        const options = {
          format,
          projectName: 'Checkout Review',
          includeImages: true,
          theme: 'dark' as const,
        };
        const first = await prepareReviewExportDestination(
          outputRoot,
          reviewSession(),
          options,
          'same-nonce',
        );
        await writeFile(first, 'first artifact', 'utf8');
        const second = await prepareReviewExportDestination(
          outputRoot,
          reviewSession(),
          options,
          'same-nonce',
        );

        expect(second).not.toBe(first);
        expect(dirname(second)).not.toBe(dirname(first));
        expect(await readFile(first, 'utf8')).toBe('first artifact');
        const canonicalOutputRoot = await realpath(outputRoot);
        for (const destination of [first, second]) {
          const child = relative(canonicalOutputRoot, resolve(destination));
          expect(child.startsWith(`exports/checkout-review-feedback-`)).toBe(true);
          expect(child.includes('..')).toBe(false);
          expect((await stat(dirname(destination))).mode & 0o777).toBe(0o700);
        }
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it.each(['failed result', 'thrown error'] as const)(
    'removes the private export namespace after a %s',
    async (failureMode) => {
      const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
      const outputRoot = join(fixtureRoot, 'output');
      let allocatedDirectory = '';
      try {
        await mkdir(outputRoot);
        const operation = async (outputPath: string) => {
          allocatedDirectory = dirname(outputPath);
          await writeFile(join(allocatedDirectory, 'partial-artifact'), 'partial');
          if (failureMode === 'thrown error') throw new Error('export crashed');
          return { success: false, error: 'export failed' };
        };

        if (failureMode === 'thrown error') {
          await expect(runReviewExportInPrivateDirectory(
            outputRoot,
            reviewSession(),
            { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
            operation,
          )).rejects.toThrow('export crashed');
        } else {
          await expect(runReviewExportInPrivateDirectory(
            outputRoot,
            reviewSession(),
            { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
            operation,
          )).resolves.toEqual({ success: false, error: 'export failed' });
        }
        await expect(access(allocatedDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it('fails closed when the exports path is not a directory', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-'));
    const outputRoot = join(fixtureRoot, 'output');
    try {
      await mkdir(outputRoot);
      await writeFile(join(outputRoot, 'exports'), 'not a directory');

      await expect(prepareReviewExportDestination(
        outputRoot,
        reviewSession(),
        { format: 'html', projectName: 'Checkout Review', includeImages: true, theme: 'dark' },
        'not-a-directory',
      )).rejects.toThrow(/export directory|directory/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
