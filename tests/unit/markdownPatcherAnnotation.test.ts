import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import { appendExtractedFramesToReport } from '../../src/main/output/MarkdownPatcher';

describe('MarkdownPatcher annotation context', () => {
  it('describes the burned-in annotation beside its extracted report frame', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markupr-annotation-report-'));
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
});
