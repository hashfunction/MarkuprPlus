import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupPdfExportResources,
  ExportService,
} from '../../src/main/output/ExportService';
import type { Session } from '../../src/main/output/MarkdownGenerator';
import { prepareReviewExportDestination } from '../../src/main/output/ReviewExportRequest';
import type { ReviewExportFormat, ReviewSession } from '../../src/shared/types';

vi.unmock('sharp');

const fixtureRoots: string[] = [];
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG_BYTES = Buffer.from(
  '/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ+AHQj/2Q==',
  'base64',
);
const WEBP_BYTES = Buffer.from(
  'UklGRjAAAABXRUJQVlA4ICQAAABwAQCdASoCAAIAAUAmJYwCdAFAAAD++xnLAkrVm6cszhXnwAA=',
  'base64',
);

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'markuprplus-export-artifact-'));
  fixtureRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

function evidenceSession(): ReviewSession {
  return {
    id: 'evidence-session',
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_005_000,
    feedbackItems: [
      {
        id: 'ordinary-feedback',
        transcription: 'The ordinary screenshot documents the checkout state.',
        timestamp: 1_700_000_001_000,
        screenshots: [{
          id: 'ordinary-screenshot',
          timestamp: 1_700_000_001_000,
          imagePath: '',
          base64: PNG_BYTES.toString('base64'),
          mimeType: 'image/png',
          width: 1280,
          height: 720,
        }],
        reviewItemKind: 'feedback',
        category: 'UX Issue',
        severity: 'High',
      },
      {
        id: 'marked-issue-1',
        transcription: 'The genuine marked evidence documents the footer overlap.',
        timestamp: 1_700_000_002_000,
        screenshots: [{
          id: 'marked-issue-1-evidence',
          timestamp: 1_700_000_002_000,
          imagePath: '',
          base64: JPEG_BYTES.toString('base64'),
          mimeType: 'image/jpeg',
          width: 960,
          height: 540,
        }],
        reviewItemKind: 'marked-issue',
        markedIssueOrdinal: 1,
        category: 'UX Issue',
        severity: 'Medium',
      },
      {
        id: 'webp-feedback',
        transcription: 'The WebP evidence documents the responsive navigation state.',
        timestamp: 1_700_000_003_000,
        screenshots: [{
          id: 'webp-screenshot',
          timestamp: 1_700_000_003_000,
          imagePath: '',
          base64: WEBP_BYTES.toString('base64'),
          mimeType: 'image/webp',
          width: 800,
          height: 600,
        }],
        reviewItemKind: 'feedback',
        category: 'UX Issue',
        severity: 'Medium',
      },
    ],
    metadata: {
      os: 'darwin',
      sourceName: 'Evidence App',
      sourceType: 'window',
    },
  };
}

async function destination(
  root: string,
  format: ReviewExportFormat,
  includeImages: boolean,
  nonce: string,
): Promise<string> {
  await mkdir(root, { recursive: true });
  return prepareReviewExportDestination(root, evidenceSession(), {
    format,
    projectName: 'Evidence Audit',
    includeImages,
    theme: 'light',
  }, nonce);
}

describe('real review export artifacts', () => {
  it('writes every Markdown image reference as a colocated deterministic asset', async () => {
    const outputRoot = await fixtureRoot();
    const outputPath = await destination(outputRoot, 'markdown', true, 'markdown-images');

    const result = await new ExportService().export(evidenceSession() as Session, {
      format: 'markdown',
      outputPath,
      projectName: 'Evidence Audit',
      includeImages: true,
      theme: 'light',
      screenshotDir: './assets',
    });

    expect(result.success).toBe(true);
    const markdown = await readFile(outputPath, 'utf8');
    const references = [...markdown.matchAll(/!\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => match[1]);
    expect(references).toEqual([
      './assets/fb-001.png',
      './assets/fb-002.jpg',
      './assets/fb-003.webp',
    ]);
    await expect(readFile(resolve(dirname(outputPath), references[0])))
      .resolves.toEqual(PNG_BYTES);
    await expect(readFile(resolve(dirname(outputPath), references[1])))
      .resolves.toEqual(JPEG_BYTES);
    await expect(readFile(resolve(dirname(outputPath), references[2])))
      .resolves.toEqual(WEBP_BYTES);
    expect(markdown).toContain('Screenshots: 3');
  });

  it('makes Markdown evidence and screenshot counts truthful when images are excluded', async () => {
    const outputRoot = await fixtureRoot();
    const outputPath = await destination(outputRoot, 'markdown', false, 'markdown-no-images');

    const result = await new ExportService().export(evidenceSession() as Session, {
      format: 'markdown',
      outputPath,
      projectName: 'Evidence Audit',
      includeImages: false,
      theme: 'light',
      screenshotDir: './assets',
    });

    expect(result.success).toBe(true);
    const markdown = await readFile(outputPath, 'utf8');
    expect(markdown).toContain('Screenshots: 0');
    expect(markdown).not.toMatch(/!\[[^\]]+\]\([^)]+\)/);
    expect(markdown.match(/_Screenshots were excluded from this export\._/g)).toHaveLength(3);
    expect(markdown).not.toContain('No screenshot captured');
  });

  it('embeds hydrated HTML images only when requested and reports a truthful count', async () => {
    const outputRoot = await fixtureRoot();
    const service = new ExportService();
    const withImagesPath = await destination(outputRoot, 'html', true, 'html-images');
    const withoutImagesPath = await destination(outputRoot, 'html', false, 'html-no-images');

    expect((await service.export(evidenceSession() as Session, {
      format: 'html',
      outputPath: withImagesPath,
      projectName: 'Evidence Audit',
      includeImages: true,
      theme: 'light',
    })).success).toBe(true);
    expect((await service.export(evidenceSession() as Session, {
      format: 'html',
      outputPath: withoutImagesPath,
      projectName: 'Evidence Audit',
      includeImages: false,
      theme: 'light',
    })).success).toBe(true);

    const withImages = await readFile(withImagesPath, 'utf8');
    const withoutImages = await readFile(withoutImagesPath, 'utf8');
    expect(withImages).toContain(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    expect(withImages).toContain(`data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`);
    expect(withImages).toContain(`data:image/webp;base64,${WEBP_BYTES.toString('base64')}`);
    expect(withImages).toContain('3 screenshots');
    expect(withImages).toContain('<meta name="theme-color" content="#ffffff">');
    expect(withoutImages).not.toContain('data:image/png;base64,');
    expect(withoutImages).toContain('0 screenshots');
  });

  it('builds PDF input with embedded evidence only when requested', async () => {
    const outputRoot = await fixtureRoot();
    const service = new ExportService();

    const exportAndCapturePdfHtml = async (includeImages: boolean, nonce: string) => {
      const outputPath = await destination(outputRoot, 'pdf', includeImages, nonce);
      let loadedPath = '';
      let capturedHtml = '';
      const pdfWindow = {
        loadFile: vi.fn(async (filePath: string) => {
          loadedPath = filePath;
        }),
        destroy: vi.fn(),
        webContents: {
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          printToPDF: vi.fn(async () => {
            capturedHtml = await readFile(loadedPath, 'utf8');
            return Buffer.from('real-export-service-pdf');
          }),
        },
      };
      vi.mocked(BrowserWindow).mockImplementationOnce(function PdfWindowMock() {
        return pdfWindow as never;
      });

      const result = await service.export(evidenceSession() as Session, {
        format: 'pdf',
        outputPath,
        projectName: 'Evidence Audit',
        includeImages,
        theme: 'light',
      });
      expect(result.success).toBe(true);
      expect(vi.mocked(BrowserWindow).mock.calls.at(-1)?.[0]).toMatchObject({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
          navigateOnDragDrop: false,
          javascript: false,
        },
      });
      await expect(readFile(outputPath)).resolves.toEqual(Buffer.from('real-export-service-pdf'));
      return capturedHtml;
    };

    const withImages = await exportAndCapturePdfHtml(true, 'pdf-images');
    const withoutImages = await exportAndCapturePdfHtml(false, 'pdf-no-images');
    expect(withImages).toContain(`data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    expect(withImages).toContain(`data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`);
    expect(withImages).toContain(`data:image/webp;base64,${WEBP_BYTES.toString('base64')}`);
    expect(withImages).toContain('3 screenshots');
    expect(withoutImages).not.toContain('data:image/png;base64,');
    expect(withoutImages).toContain('0 screenshots');
  });

  it.each(['symlink', 'regular file'] as const)(
    'does not overwrite a pre-created predictable PDF temp %s',
    async (occupiedType) => {
      const outputRoot = await fixtureRoot();
      const outputPath = await destination(outputRoot, 'pdf', false, `pdf-${occupiedType}`);
      const fixedNow = 1_900_000_000_123;
      const predictablePath = join(tmpdir(), `markuprx-pdf-export-${fixedNow}.html`);
      const outsidePath = join(outputRoot, `outside-${occupiedType}.html`);
      await rm(predictablePath, { force: true });
      await writeFile(outsidePath, 'attacker-owned sentinel', 'utf8');
      if (occupiedType === 'symlink') {
        await symlink(outsidePath, predictablePath);
      } else {
        await writeFile(predictablePath, 'occupied temp sentinel', 'utf8');
      }
      const now = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      let loadedPath = '';
      const pdfWindow = {
        loadFile: vi.fn(async (filePath: string) => {
          loadedPath = filePath;
        }),
        destroy: vi.fn(),
        webContents: {
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          printToPDF: vi.fn(async () => Buffer.from('collision-safe-pdf')),
        },
      };
      vi.mocked(BrowserWindow).mockImplementationOnce(function PdfWindowMock() {
        return pdfWindow as never;
      });

      try {
        const result = await new ExportService().export(evidenceSession() as Session, {
          format: 'pdf',
          outputPath,
          includeImages: false,
          theme: 'light',
        });
        expect(result.success).toBe(true);
        expect(loadedPath).not.toBe(predictablePath);
        if (occupiedType === 'symlink') {
          expect(await readFile(outsidePath, 'utf8')).toBe('attacker-owned sentinel');
        } else {
          expect(await readFile(predictablePath, 'utf8')).toBe('occupied temp sentinel');
        }
      } finally {
        now.mockRestore();
        await rm(predictablePath, { force: true });
      }
    },
  );

  it.each(['success', 'print failure', 'destroy failure', 'print and destroy failure'] as const)(
    'uses a private PDF temp namespace and removes it after %s',
    async (outcome) => {
      const outputRoot = await fixtureRoot();
      const outputPath = await destination(outputRoot, 'pdf', false, `pdf-cleanup-${outcome}`);
      let temporaryDirectory = '';
      const pdfWindow = {
        loadFile: vi.fn(async (filePath: string) => {
          temporaryDirectory = dirname(filePath);
          expect((await lstat(temporaryDirectory)).mode & 0o777).toBe(0o700);
          expect((await lstat(filePath)).mode & 0o777).toBe(0o600);
        }),
        destroy: vi.fn(() => {
          if (outcome.includes('destroy failure')) throw new Error('destroy failed');
        }),
        webContents: {
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          printToPDF: vi.fn(async () => {
            if (outcome.includes('print')) throw new Error('print failed');
            return Buffer.from('private-temp-pdf');
          }),
        },
      };
      vi.mocked(BrowserWindow).mockImplementationOnce(function PdfWindowMock() {
        return pdfWindow as never;
      });

      const result = await new ExportService().export(evidenceSession() as Session, {
        format: 'pdf',
        outputPath,
        includeImages: false,
        theme: 'light',
      });
      expect(result.success).toBe(outcome === 'success');
      if (outcome === 'print and destroy failure') {
        expect(result.error).toMatch(/print failed/i);
        expect(result.error).toMatch(/destroy failed/i);
      }
      expect(temporaryDirectory).not.toBe('');
      await expect(access(temporaryDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('destroys its hidden PDF window when navigation-guard setup fails', async () => {
    const outputRoot = await fixtureRoot();
    const outputPath = await destination(outputRoot, 'pdf', false, 'pdf-guard-setup');
    const destroy = vi.fn();
    const pdfWindow = {
      loadFile: vi.fn(),
      destroy,
      webContents: {
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(() => {
          throw new Error('navigation guard setup failed');
        }),
        printToPDF: vi.fn(),
      },
    };
    vi.mocked(BrowserWindow).mockImplementationOnce(function PdfWindowMock() {
      return pdfWindow as never;
    });

    const result = await new ExportService().export(evidenceSession() as Session, {
      format: 'pdf',
      outputPath,
      includeImages: false,
      theme: 'light',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/navigation guard setup failed/i),
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('attempts PDF directory removal and aggregates destroy plus removal failures', async () => {
    const destroyError = new Error('destroy teardown failed');
    const removalError = new Error('temp namespace removal failed');
    const removeDirectory = vi.fn(async () => {
      throw removalError;
    });
    const destroy = vi.fn(() => {
      throw destroyError;
    });

    let failure: unknown;
    try {
      await cleanupPdfExportResources(
        { destroy },
        '/private/pdf-temp-namespace',
        removeDirectory,
      );
    } catch (error) {
      failure = error;
    }

    expect(destroy).toHaveBeenCalledOnce();
    expect(removeDirectory).toHaveBeenCalledWith(
      '/private/pdf-temp-namespace',
      { recursive: true, force: true },
    );
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([destroyError, removalError]);
  });

  it('keeps JSON evidence metadata-only even when the UI image toggle is on', async () => {
    const outputRoot = await fixtureRoot();
    const outputPath = await destination(outputRoot, 'json', true, 'json-metadata');

    const result = await new ExportService().export(evidenceSession() as Session, {
      format: 'json',
      outputPath,
      projectName: 'Evidence Audit',
      includeImages: true,
      theme: 'light',
    });

    expect(result.success).toBe(true);
    const json = JSON.parse(await readFile(outputPath, 'utf8')) as {
      session: { items: Array<{ screenshots: Array<{ base64?: string }> }> };
      summary: { screenshotCount: number };
    };
    expect(json.summary.screenshotCount).toBe(3);
    expect(json.session.items.flatMap((item) => item.screenshots))
      .toEqual([
        expect.not.objectContaining({ base64: expect.anything() }),
        expect.not.objectContaining({ base64: expect.anything() }),
        expect.not.objectContaining({ base64: expect.anything() }),
      ]);
  });

  it.each(['html', 'markdown'] as const)(
    'never overwrites an occupied %s artifact during a second real export',
    async (format) => {
      const outputRoot = await fixtureRoot();
      const service = new ExportService();
      const firstPath = await destination(outputRoot, format, false, 'same-nonce');
      expect((await service.export(evidenceSession() as Session, {
        format,
        outputPath: firstPath,
        projectName: 'Evidence Audit',
        includeImages: false,
        theme: 'light',
      })).success).toBe(true);
      const original = await readFile(firstPath);

      const secondPath = await destination(outputRoot, format, false, 'same-nonce');
      const secondSession = evidenceSession();
      secondSession.feedbackItems[0].transcription = 'The second export is different.';
      expect((await service.export(secondSession as Session, {
        format,
        outputPath: secondPath,
        projectName: 'Evidence Audit',
        includeImages: false,
        theme: 'light',
      })).success).toBe(true);

      expect(secondPath).not.toBe(firstPath);
      expect(dirname(secondPath)).not.toBe(dirname(firstPath));
      expect(await readFile(firstPath)).toEqual(original);
      const canonicalOutputRoot = await realpath(outputRoot);
      expect(relative(canonicalOutputRoot, firstPath)).toMatch(/^exports\//);
      expect(relative(canonicalOutputRoot, secondPath)).toMatch(/^exports\//);
    },
  );
});
