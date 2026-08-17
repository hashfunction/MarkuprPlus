import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportService } from '../../src/main/output/ExportService';
import type { Session } from '../../src/main/output/MarkdownGenerator';
import { prepareReviewExportDestination } from '../../src/main/output/ReviewExportRequest';
import type { ReviewExportFormat, ReviewSession } from '../../src/shared/types';

const fixtureRoots: string[] = [];

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
          base64: Buffer.from('ordinary image bytes').toString('base64'),
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
          base64: Buffer.from('marked image bytes').toString('base64'),
          width: 960,
          height: 540,
        }],
        reviewItemKind: 'marked-issue',
        markedIssueOrdinal: 1,
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
    expect(references).toEqual(['./assets/fb-001.png', './assets/fb-002.png']);
    await expect(readFile(resolve(dirname(outputPath), references[0])))
      .resolves.toEqual(Buffer.from('ordinary image bytes'));
    await expect(readFile(resolve(dirname(outputPath), references[1])))
      .resolves.toEqual(Buffer.from('marked image bytes'));
    expect(markdown).toContain('Screenshots: 2');
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
    expect(markdown.match(/_Screenshots were excluded from this export\._/g)).toHaveLength(2);
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
    expect(withImages).toContain(`data:image/png;base64,${Buffer.from('ordinary image bytes').toString('base64')}`);
    expect(withImages).toContain(`data:image/png;base64,${Buffer.from('marked image bytes').toString('base64')}`);
    expect(withImages).toContain('2 screenshots');
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
      vi.mocked(BrowserWindow).mockImplementationOnce(() => pdfWindow as never);

      const result = await service.export(evidenceSession() as Session, {
        format: 'pdf',
        outputPath,
        projectName: 'Evidence Audit',
        includeImages,
        theme: 'light',
      });
      expect(result.success).toBe(true);
      await expect(readFile(outputPath)).resolves.toEqual(Buffer.from('real-export-service-pdf'));
      return capturedHtml;
    };

    const withImages = await exportAndCapturePdfHtml(true, 'pdf-images');
    const withoutImages = await exportAndCapturePdfHtml(false, 'pdf-no-images');
    expect(withImages).toContain(`data:image/png;base64,${Buffer.from('ordinary image bytes').toString('base64')}`);
    expect(withImages).toContain(`data:image/png;base64,${Buffer.from('marked image bytes').toString('base64')}`);
    expect(withImages).toContain('2 screenshots');
    expect(withoutImages).not.toContain('data:image/png;base64,');
    expect(withoutImages).toContain('0 screenshots');
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
    expect(json.summary.screenshotCount).toBe(2);
    expect(json.session.items.flatMap((item) => item.screenshots))
      .toEqual([expect.not.objectContaining({ base64: expect.anything() }), expect.not.objectContaining({ base64: expect.anything() })]);
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
