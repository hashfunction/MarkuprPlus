import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReviewExportDestination,
  prepareReviewExportDestination,
  runReviewExportInPrivateDirectory,
  sanitizeReviewExportOptions,
  trustedReviewExportSession,
} from '../../src/main/output/ReviewExportRequest';
import { sanitizeReviewSession } from '../../src/main/output/SavedReviewUpdater';
import type { ReviewSession } from '../../src/shared/types';

vi.unmock('sharp');

const fileRaceHooks = vi.hoisted(() => ({
  beforeOpen: undefined as undefined | ((filePath: string) => Promise<void>),
  afterOpenedStat: undefined as undefined | ((filePath: string) => Promise<void>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (filePath: string, flags: number) => {
      const beforeOpen = fileRaceHooks.beforeOpen;
      fileRaceHooks.beforeOpen = undefined;
      if (beforeOpen) await beforeOpen(String(filePath));
      const handle = await actual.open(filePath, flags);
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'stat') {
            return async () => {
              const stats = await target.stat();
              const afterOpenedStat = fileRaceHooks.afterOpenedStat;
              fileRaceHooks.afterOpenedStat = undefined;
              if (afterOpenedStat) await afterOpenedStat(String(filePath));
              return stats;
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

afterEach(() => {
  fileRaceHooks.beforeOpen = undefined;
  fileRaceHooks.afterOpenedStat = undefined;
});

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

const exportFormats = ['markdown', 'html', 'pdf', 'json'] as const;
const imageFixtures = [
  {
    label: 'PNG',
    mimeType: 'image/png',
    extension: 'png',
    bytes: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  },
  {
    label: 'JPEG',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    bytes: Buffer.from(
      '/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ+AHQj/2Q==',
      'base64',
    ),
  },
  {
    label: 'WebP',
    mimeType: 'image/webp',
    extension: 'webp',
    bytes: Buffer.from(
      'UklGRjAAAABXRUJQVlA4ICQAAABwAQCdASoCAAIAAUAmJYwCdAFAAAD++xnLAkrVm6cszhXnwAA=',
      'base64',
    ),
  },
] as const;

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

  it.each(exportFormats)(
    'rejects a renderer-only completed session for %s export',
    async (format) => {
      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession: null,
        sessionDirectory: null,
        outputRoot: '/not-read-without-images',
        format,
        includeImages: false,
      })).rejects.toThrow(/main-owned|matching session/i);
    },
  );

  it.each(exportFormats)(
    'requires the main-owned id and start time to match for %s export',
    async (format) => {
      for (const mainOwnedSession of [
        { ...reviewSession(), id: 'different-session-id' },
        { ...reviewSession(), startTime: reviewSession().startTime + 1 },
      ]) {
        await expect(trustedReviewExportSession(reviewSession(), {
          mainOwnedSession,
          sessionDirectory: null,
          outputRoot: '/not-read-without-images',
          format,
          includeImages: false,
        })).rejects.toThrow(/main-owned|matching session/i);
      }
    },
  );

  it.each(exportFormats)(
    'requires a completed main-owned identity for %s export',
    async (format) => {
      const mainOwnedSession = reviewSession();
      delete mainOwnedSession.endTime;

      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory: null,
        outputRoot: '/not-read-without-images',
        format,
        includeImages: false,
      })).rejects.toThrow(/main-owned.*completed|completed main-owned/i);
    },
  );

  it('pins lifecycle, source, and item identity to main state while retaining intended review edits', async () => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.endTime = 1_700_000_009_000;
    mainOwnedSession.metadata = {
      os: 'darwin',
      sourceName: 'Main-owned Checkout',
      sourceType: 'window',
      videoStartTime: 1_700_000_000_500,
    };
    mainOwnedSession.feedbackItems[0] = {
      ...mainOwnedSession.feedbackItems[0],
      title: 'Main-owned title',
      keywords: ['main-owned'],
      reviewItemKind: 'feedback',
    };
    mainOwnedSession.feedbackItems.push(markedReviewItem());

    const rendererSession = reviewSession();
    rendererSession.endTime = 1_900_000_000_000;
    rendererSession.metadata = {
      os: 'renderer-os',
      sourceName: 'Renderer source spoof',
      sourceType: 'screen',
      videoStartTime: 1,
    };
    rendererSession.feedbackItems[0] = {
      ...rendererSession.feedbackItems[0],
      transcription: 'Renderer-edited ordinary transcription.',
      category: 'Suggestion',
      severity: 'Low',
      timestamp: 9,
      title: 'Renderer title spoof',
      keywords: ['renderer-spoof'],
      reviewItemKind: 'marked-issue',
      markedIssueOrdinal: 99,
    };
    rendererSession.feedbackItems.push({
      ...markedReviewItem(),
      transcription: 'Renderer-edited marked transcription.',
      category: 'Bug',
      severity: 'Critical',
      timestamp: 10,
      reviewItemKind: 'feedback',
      markedIssueOrdinal: 77,
    });
    rendererSession.feedbackItems.reverse();

    const exported = await trustedReviewExportSession(rendererSession, {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-without-images',
      format: 'json',
      includeImages: false,
    });

    expect(exported.endTime).toBe(1_700_000_009_000);
    expect(exported.metadata).toEqual(mainOwnedSession.metadata);
    expect(exported.feedbackItems.map((item) => item.id)).toEqual([
      'marked-issue-1',
      'feedback-1',
    ]);
    expect(exported.feedbackItems[0]).toMatchObject({
      transcription: 'Renderer-edited marked transcription.',
      category: 'Bug',
      severity: 'Critical',
      timestamp: markedReviewItem().timestamp,
      reviewItemKind: 'marked-issue',
      markedIssueOrdinal: 1,
    });
    expect(exported.feedbackItems[1]).toMatchObject({
      transcription: 'Renderer-edited ordinary transcription.',
      category: 'Suggestion',
      severity: 'Low',
      timestamp: reviewSession().feedbackItems[0].timestamp,
      title: 'Main-owned title',
      keywords: ['main-owned'],
      reviewItemKind: 'feedback',
    });
    expect(exported.feedbackItems[1].markedIssueOrdinal).toBeUndefined();
  });

  it('rejects renderer-invented review items that have no main-owned identity', async () => {
    const rendererSession = reviewSession();
    rendererSession.feedbackItems.push({
      ...rendererSession.feedbackItems[0],
      id: 'renderer-invented-item',
      transcription: 'Renderer-invented export content.',
    });

    await expect(trustedReviewExportSession(rendererSession, {
      mainOwnedSession: reviewSession(),
      sessionDirectory: null,
      outputRoot: '/not-read-without-images',
      format: 'json',
      includeImages: false,
    })).rejects.toThrow(/main-owned.*item|item.*main-owned/i);
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

  it('allowlists source types and omits malformed structured-clone values', () => {
    for (const sourceType of ['screen', 'window', 'region'] as const) {
      const input = reviewSession();
      input.metadata!.sourceType = sourceType;
      const sanitized = sanitizeReviewSession(input);
      expect(sanitized.metadata?.sourceType).toBe(sourceType);
    }

    for (const sourceType of ['display', { type: 'window' }, ['screen'], 42, true]) {
      const input = reviewSession();
      input.metadata!.sourceType = sourceType as never;
      const sanitized = sanitizeReviewSession(input);
      expect(sanitized.metadata?.sourceType).toBeUndefined();
    }
  });

  it('hydrates ordinary and marked bytes only from identity-matched main-owned evidence', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const markedBytes = imageFixtures[0].bytes;
    const ordinaryBytes = imageFixtures[0].bytes;
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

  it.each(imageFixtures)(
    'detects trusted %s media for ordinary base64 and marked saved-file evidence',
    async ({ mimeType, extension, bytes }) => {
      const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-media-'));
      const outputRoot = join(fixtureRoot, 'output');
      const sessionDirectory = join(outputRoot, 'saved-session');
      const relativeImagePath = `screenshots/marked-issue-001.${extension}`;
      try {
        await mkdir(join(sessionDirectory, 'screenshots'), { recursive: true });
        await writeFile(join(sessionDirectory, relativeImagePath), bytes);

        const rendererSession = reviewSession();
        rendererSession.feedbackItems[0].screenshots[0] = {
          ...rendererSession.feedbackItems[0].screenshots[0],
          mimeType: 'image/gif',
        } as never;
        rendererSession.feedbackItems.push(markedReviewItem());
        const mainOwnedSession = reviewSession();
        mainOwnedSession.feedbackItems[0].screenshots[0] = {
          ...mainOwnedSession.feedbackItems[0].screenshots[0],
          imagePath: '',
          base64: `data:${mimeType};base64,${bytes.toString('base64')}`,
        };
        mainOwnedSession.feedbackItems.push({
          ...markedReviewItem(),
          screenshots: [{
            ...markedReviewItem().screenshots[0],
            imagePath: relativeImagePath,
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
          expect.objectContaining({ mimeType, imagePath: '', base64: bytes.toString('base64') }),
          expect.objectContaining({ mimeType, imagePath: '', base64: bytes.toString('base64') }),
        ]);
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it('resolves the saved directory lazily only after validating main-owned identity', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-media-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const relativeImagePath = 'screenshots/main-owned.png';
    let resolveCalls = 0;
    try {
      await mkdir(join(sessionDirectory, 'screenshots'), { recursive: true });
      await writeFile(join(sessionDirectory, relativeImagePath), imageFixtures[0].bytes);
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0] = {
        ...mainOwnedSession.feedbackItems[0].screenshots[0],
        imagePath: relativeImagePath,
        base64: undefined,
      };
      const context = {
        mainOwnedSession,
        sessionDirectory: null,
        resolveSessionDirectory: async () => {
          resolveCalls += 1;
          return sessionDirectory;
        },
        outputRoot,
        format: 'html' as const,
        includeImages: true,
      };
      const mismatched = reviewSession();
      mismatched.startTime += 1;

      await expect(trustedReviewExportSession(mismatched, context))
        .rejects.toThrow(/matching main-owned/i);
      expect(resolveCalls).toBe(0);
      await expect(trustedReviewExportSession(reviewSession(), context)).resolves.toBeTruthy();
      expect(resolveCalls).toBe(1);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each([
    { label: 'plain text', bytes: Buffer.from('this is not an image') },
    { label: 'GIF', bytes: Buffer.from('47494638396101000100', 'hex') },
  ])('rejects $label supplied as main-owned base64 evidence', async ({ bytes }) => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/supported (?:PNG|JPEG|WebP)|image signature/i);
  });

  it.each([
    { label: 'plain text', bytes: Buffer.from('this is not an image') },
    { label: 'GIF', bytes: Buffer.from('47494638396101000100', 'hex') },
  ])('rejects $label supplied as a main-owned evidence file', async ({ bytes }) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-media-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const relativeImagePath = 'screenshots/untrusted.bin';
    try {
      await mkdir(join(sessionDirectory, 'screenshots'), { recursive: true });
      await writeFile(join(sessionDirectory, relativeImagePath), bytes);
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0] = {
        ...mainOwnedSession.feedbackItems[0].screenshots[0],
        imagePath: relativeImagePath,
        base64: undefined,
      };

      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'markdown',
        includeImages: true,
      })).rejects.toThrow(/supported (?:PNG|JPEG|WebP)|image signature/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a declared MIME type that disagrees with main-owned image bytes', async () => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: `data:image/png;base64,${imageFixtures[1].bytes.toString('base64')}`,
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/declared.*image\/png.*image\/jpeg|MIME.*match/i);
  });

  it.each([
    { label: 'an excessive dimension', width: 20_000, height: 1, message: /dimension/i },
    { label: 'an excessive pixel count', width: 10_000, height: 10_000, message: /pixel/i },
  ])('rejects PNG evidence with $label', async ({ width, height, message }) => {
    const bytes = Buffer.from(imageFixtures[0].bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(message);
  });

  it('rejects a PNG whose first chunk is not a complete 13-byte IHDR', async () => {
    const bytes = Buffer.from(imageFixtures[0].bytes);
    bytes.writeUInt32BE(12, 8);
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/malformed image\/png|IHDR/i);
  });

  it('rejects a PNG truncated before the complete IHDR data and CRC', async () => {
    const bytes = imageFixtures[0].bytes.subarray(0, 24);
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/malformed image\/png|IHDR/i);
  });

  it.each([
    {
      label: 'PNG without its terminal IEND chunk',
      bytes: imageFixtures[0].bytes.subarray(0, imageFixtures[0].bytes.length - 12),
    },
    {
      label: 'JPEG without its terminal EOI marker',
      bytes: imageFixtures[1].bytes.subarray(0, imageFixtures[1].bytes.length - 2),
    },
    {
      label: 'WebP truncated before its declared RIFF container end',
      bytes: (() => {
        const bytes = Buffer.from(imageFixtures[2].bytes);
        bytes.writeUInt32LE(bytes.length, 4);
        return bytes;
      })(),
    },
  ])('rejects $label after a valid dimension header', async ({ bytes }) => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/malformed|truncated|container|terminal|image data/i);
  });

  it.each([
    {
      label: 'PNG with invalid CRCs and empty image data',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAAAAAAAAAAAElEQVQAAAAAAAAAAElFTkQAAAAA',
        'base64',
      ),
    },
    {
      label: 'JPEG with a dimension header but no decodable scan data',
      bytes: Buffer.from(
        '/9j/wAARCAABAAEDAREAAhEAAxEA/9oADAMBAAIRAxEAPwAAESL/2Q==',
        'base64',
      ),
    },
    {
      label: 'WebP with only an extended header and no image payload',
      bytes: Buffer.from(
        'UklGRhYAAABXRUJQVlA4WAoAAAAAAAAAAAAAAAAA',
        'base64',
      ),
    },
  ])('rejects structurally plausible but non-decodable $label', async ({ bytes }) => {
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: bytes.toString('base64'),
    };

    await expect(trustedReviewExportSession(reviewSession(), {
      mainOwnedSession,
      sessionDirectory: null,
      outputRoot: '/not-read-for-base64',
      format: 'html',
      includeImages: true,
    })).rejects.toThrow(/corrupt|decode|invalid|malformed|image data/i);
  });

  it('rejects oversized encoded image data before invoking the base64 decoder', async () => {
    const oversizedBase64 = 'A'.repeat(16 * 1024 * 1024 + 4);
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: oversizedBase64,
    };
    const originalBufferFrom = Buffer.from;
    const bufferFrom = vi.spyOn(Buffer, 'from').mockImplementation(((...args: unknown[]) => {
      if (args[0] === oversizedBase64) {
        throw new Error('base64 decoder invoked before encoded-length validation');
      }
      return originalBufferFrom(...args as [string, BufferEncoding]);
    }) as typeof Buffer.from);

    try {
      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory: null,
        outputRoot: '/not-read-for-base64',
        format: 'html',
        includeImages: true,
      })).rejects.toThrow(/size limit/i);
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it('rejects an oversized data URL before copying or lowercasing its payload', async () => {
    const oversizedDataUrl = `DATA:image/png;base64,${'A'.repeat(16 * 1024 * 1024 + 4)}`;
    const mainOwnedSession = reviewSession();
    mainOwnedSession.feedbackItems[0].screenshots[0] = {
      ...mainOwnedSession.feedbackItems[0].screenshots[0],
      imagePath: '',
      base64: oversizedDataUrl,
    };
    const originalToLowerCase = String.prototype.toLowerCase;
    const toLowerCase = vi.spyOn(String.prototype, 'toLowerCase').mockImplementation(function () {
      if (this.length > 128) {
        throw new Error('whole untrusted image value lowercased before size validation');
      }
      return originalToLowerCase.call(this);
    });

    try {
      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory: null,
        outputRoot: '/not-read-for-base64',
        format: 'html',
        includeImages: true,
      })).rejects.toThrow(/size limit/i);
    } finally {
      toLowerCase.mockRestore();
    }
  });

  it('hydrates an absolute main-owned image only when it remains inside the saved session', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-images-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const absoluteImage = join(sessionDirectory, 'screenshots', 'absolute.png');
    try {
      await mkdir(dirname(absoluteImage), { recursive: true });
      await writeFile(absoluteImage, imageFixtures[0].bytes);
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
        .toBe(imageFixtures[0].bytes.toString('base64'));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a saved evidence file replaced between pathname validation and open', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-race-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const imagePath = join(sessionDirectory, 'screenshots', 'evidence.png');
    try {
      await mkdir(dirname(imagePath), { recursive: true });
      await writeFile(imagePath, imageFixtures[0].bytes);
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = 'screenshots/evidence.png';
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;
      const canonicalImagePath = await realpath(imagePath);
      fileRaceHooks.beforeOpen = async (openedPath) => {
        expect(openedPath).toBe(canonicalImagePath);
        await rename(imagePath, `${imagePath}.original`);
        // Keep size and content identical so only pathname-to-handle identity
        // validation can detect the newly created inode.
        await writeFile(imagePath, imageFixtures[0].bytes);
      };

      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'html',
        includeImages: true,
      })).rejects.toThrow(/changed|replaced|identity/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a saved evidence file that grows after the opened-file size check', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'markuprplus-export-race-'));
    const outputRoot = join(fixtureRoot, 'output');
    const sessionDirectory = join(outputRoot, 'saved-session');
    const imagePath = join(sessionDirectory, 'screenshots', 'evidence.png');
    try {
      await mkdir(dirname(imagePath), { recursive: true });
      await writeFile(imagePath, imageFixtures[0].bytes);
      const mainOwnedSession = reviewSession();
      mainOwnedSession.feedbackItems[0].screenshots[0].imagePath = 'screenshots/evidence.png';
      mainOwnedSession.feedbackItems[0].screenshots[0].base64 = undefined;
      const canonicalImagePath = await realpath(imagePath);
      fileRaceHooks.afterOpenedStat = async (openedPath) => {
        expect(openedPath).toBe(canonicalImagePath);
        await writeFile(imagePath, imageFixtures[1].bytes);
      };

      await expect(trustedReviewExportSession(reviewSession(), {
        mainOwnedSession,
        sessionDirectory,
        outputRoot,
        format: 'html',
        includeImages: true,
      })).rejects.toThrow(/changed|grew|size/i);
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
