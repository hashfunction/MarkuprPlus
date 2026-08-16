import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkedIssueAccumulator } from '../../src/main/capture/MarkedIssueAccumulator';
import { MarkedIssueArtifactStore } from '../../src/main/capture/MarkedIssueArtifactStore';
import {
  assignMarkedIssueComments,
  insertMarkedIssuesSection,
} from '../../src/main/output/MarkedIssueReportBuilder';
import type { AnnotationColor, AnnotationTool } from '../../src/shared/types';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const VIDEO_START = 1_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('multi-issue marked recording flow', () => {
  it('keeps three marked screens, screenshots, and narrated comments separate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markupr-marked-session-'));
    temporaryRoots.push(root);
    const outputDir = join(root, 'output');
    const artifacts = new MarkedIssueArtifactStore(join(root, 'staging'));
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    const tools: AnnotationTool[] = ['circle', 'arrow', 'highlight'];
    const colors: AnnotationColor[] = ['#ff3b30', '#007aff', '#ffcc00'];

    for (let index = 0; index < 3; index += 1) {
      const ordinal = index + 1;
      const strokeId = `stroke-${ordinal}`;
      const startedAt = VIDEO_START + ordinal * 20_000;
      const markedAt = startedAt + 1_000;
      expect(accumulator.consume({
        type: 'stroke-start',
        sessionId: SESSION_ID,
        stroke: {
          id: strokeId,
          tool: tools[index],
          color: colors[index],
          width: 0.008,
          points: [{ x: 0.1 * ordinal, y: 0.2 }],
        },
      }, startedAt)).toEqual({ accepted: true });
      expect(accumulator.consume({
        type: 'stroke-end',
        sessionId: SESSION_ID,
        strokeId,
      }, markedAt)).toEqual({ accepted: true });

      const snapshot = accumulator.releaseModifier(markedAt + 100, VIDEO_START);
      expect(snapshot?.revision).toBe(ordinal);
      await artifacts.stageCandidate(
        SESSION_ID,
        snapshot!.revision,
        new Uint8Array([...PNG_SIGNATURE, ordinal, 0, 0, 0]),
      );
      const issue = accumulator.commit(markedAt + 500);
      expect(issue?.ordinal).toBe(ordinal);
      artifacts.markCommitted(SESSION_ID, issue!.snapshotRevision, issue!.ordinal);
    }

    const promoted = await artifacts.promoteIssues(
      SESSION_ID,
      accumulator.getIssues(),
      outputDir,
    );
    const withComments = assignMarkedIssueComments(promoted, [
      { text: 'The first button overlaps the footer.', startTime: 19, endTime: 20.5, confidence: 0.98 },
      { text: 'The second dialog needs a cancel action.', startTime: 39, endTime: 40.5, confidence: 0.97 },
      { text: 'The third heading has insufficient contrast.', startTime: 59, endTime: 60.5, confidence: 0.96 },
    ], { videoStartTime: VIDEO_START, hasAudio: true });
    const report = insertMarkedIssuesSection(
      '# Session Report\n\n## Auto-Extracted Screenshots\n\n![Generic frame](./screenshots/frame-001.png)\n',
      withComments,
    );

    expect(withComments.map((issue) => issue.id)).toEqual([
      'marked-issue-001',
      'marked-issue-002',
      'marked-issue-003',
    ]);
    expect(withComments.map((issue) => issue.comment)).toEqual([
      'The first button overlaps the footer.',
      'The second dialog needs a cancel action.',
      'The third heading has insufficient contrast.',
    ]);
    expect(await readdir(join(outputDir, 'screenshots'))).toEqual([
      'marked-issue-001.png',
      'marked-issue-002.png',
      'marked-issue-003.png',
    ]);
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      const issueId = `marked-issue-${String(ordinal).padStart(3, '0')}`;
      const bytes = new Uint8Array(await readFile(join(outputDir, 'screenshots', `${issueId}.png`)));
      expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
      expect(report.match(new RegExp(`^### MX-00${ordinal}$`, 'gm'))).toHaveLength(1);
      expect(report.match(new RegExp(`${issueId}\\.png`, 'g'))).toHaveLength(1);
    }
    expect(report.indexOf('## Marked Issues')).toBeLessThan(
      report.indexOf('## Auto-Extracted Screenshots'),
    );
    expect(report).toContain('![Generic frame](./screenshots/frame-001.png)');
  });
});
