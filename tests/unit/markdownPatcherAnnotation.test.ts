import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  appendExtractedFramesToReport,
  syncMarkedIssueMetadata,
  syncReportScreenshotSummary,
} from '../../src/main/output/MarkdownPatcher';
import type { MarkedIssuePayload } from '../../src/shared/types';

describe('MarkdownPatcher annotation context', () => {
  it('describes the burned-in annotation beside its extracted report frame', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markuprx-annotation-report-'));
    const screenshots = join(directory, 'screenshots');
    await mkdir(screenshots);
    const report = join(directory, 'feedback-report.md');
    const frame = join(screenshots, 'frame-001.png');
    await writeFile(report, '# Feedback report\n');
    await writeFile(frame, 'png');

    await appendExtractedFramesToReport(report, [{
      path: frame,
      timestamp: 2.15,
      reason: 'Annotation completed: circle',
      captureContext: {
        recordedAt: 2_000,
        trigger: 'annotation',
        annotation: { strokeId: 'stroke-1', tool: 'circle', color: '#ff3b30' },
      },
    }]);

    const markdown = await readFile(report, 'utf8');
    expect(markdown).toContain('Annotation completed: circle');
    expect(markdown).toContain('Annotation: circle (#ff3b30)');
    expect(markdown).toContain('./screenshots/frame-001.png');
  });

  it('persists finalized marked issue evidence in session metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markuprx-marked-metadata-'));
    const metadataPath = join(directory, 'metadata.json');
    const issue: MarkedIssuePayload = {
      id: 'marked-issue-001',
      ordinal: 1,
      startedAt: 1_000,
      markedAt: 1_100,
      completedAt: 1_200,
      strokeIds: ['stroke-1'],
      tools: ['circle'],
      colors: ['#ff3b30'],
      screenshotPath: 'screenshots/marked-issue-001.png',
      fallbackVideoTimestamp: 1.1,
      transcriptionStatus: 'pending',
      snapshotRevision: 1,
      transcriptSegmentIds: [],
    };
    await writeFile(metadataPath, JSON.stringify({ sessionId: 'session-1', screenshotCount: 0 }));

    await syncMarkedIssueMetadata(directory, [issue], 1);

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toMatchObject({
      markedIssues: [issue],
      screenshotCount: 1,
    });
  });

  it('keeps current and legacy report screenshot summaries aligned after promotion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markuprx-report-summary-'));
    const report = join(directory, 'feedback-report.md');
    await writeFile(report, [
      '# Project Feedback Report',
      '> Duration: 0:06 | Items: 4 | Screenshots: 0',
      '',
      '- 0 screenshots were aligned to spoken context.',
      '- **Screenshots:** 0',
      '| Duration: 0:06 | 0 screenshots | 4 items identified',
      '',
    ].join('\n'));

    await syncReportScreenshotSummary(report, 3);

    const markdown = await readFile(report, 'utf8');
    expect(markdown).toContain('> Duration: 0:06 | Items: 4 | Screenshots: 3');
    expect(markdown).toContain('- 3 screenshots were aligned to spoken context.');
    expect(markdown).toContain('- **Screenshots:** 3');
    expect(markdown).toContain('| Duration: 0:06 | 3 screenshots | 4 items identified');
  });

  it('does not duplicate marked issue fallback frames in the generic screenshot section', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markuprx-marked-frame-filter-'));
    const screenshots = join(directory, 'screenshots');
    await mkdir(screenshots);
    const report = join(directory, 'feedback-report.md');
    const markedFrame = join(screenshots, 'marked-issue-001.png');
    const ordinaryFrame = join(screenshots, 'frame-002.png');
    await writeFile(report, '# Feedback report\n');
    await writeFile(markedFrame, 'png');
    await writeFile(ordinaryFrame, 'png');

    await appendExtractedFramesToReport(report, [{
      path: markedFrame,
      timestamp: 1,
      reason: 'Marked issue MX-001',
      markedIssueId: 'marked-issue-001',
    }, {
      path: ordinaryFrame,
      timestamp: 2,
      reason: 'General observation',
    }]);

    const markdown = await readFile(report, 'utf8');
    expect(markdown).not.toContain('marked-issue-001.png');
    expect(markdown).toContain('frame-002.png');
  });
});
