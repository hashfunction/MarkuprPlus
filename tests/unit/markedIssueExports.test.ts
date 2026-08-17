import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '3.0.0') },
  BrowserWindow: vi.fn(),
}));

import type { Session } from '../../src/main/output/MarkdownGenerator';
import { generateHtmlDocument } from '../../src/main/output/templates/html-template';
import { ExportService } from '../../src/main/output/ExportService';

const markedIssue = {
  id: 'marked-issue-001',
  ordinal: 1,
  startedAt: 1_000,
  markedAt: 1_100,
  completedAt: 1_200,
  strokeIds: ['stroke-1'],
  tools: ['circle' as const],
  colors: ['#ff3b30' as const],
  screenshotPath: 'screenshots/marked-issue-001.png',
  fallbackVideoTimestamp: 1.1,
  comment: 'The save button overlaps the footer.',
  transcriptionStatus: 'available' as const,
  snapshotRevision: 1,
  transcriptSegmentIds: ['transcript-segment-0001'],
};

const session: Session = {
  id: 'session-1',
  startTime: 0,
  endTime: 2_000,
  feedbackItems: [],
  metadata: {
    sourceName: 'Test App',
    sourceType: 'window',
    markedIssues: [markedIssue],
  },
};

describe('marked issue session exports', () => {
  it('renders each marked issue and its matching image in HTML', () => {
    const html = generateHtmlDocument(session, { includeImages: true });
    expect(html).toContain('MX-001');
    expect(html).toContain('The save button overlaps the footer.');
    expect(html.match(/marked-issue-001\.png/g)).toHaveLength(1);
    expect(html).toContain('content="MarkuprPlus"');
    expect(html).toContain('href="https://markuprplus.com"');
    expect(html).not.toContain('MarkuprX');
    expect(html).not.toContain('markuprx.com');
  });

  it('includes the complete finalized array in the JSON session schema', () => {
    const json = new ExportService().generateJsonExport(session, false);
    expect(json.session.markedIssues).toEqual([markedIssue]);
    expect(json.summary.itemCount).toBe(1);
    expect(json.summary.screenshotCount).toBe(1);
    expect(json.generator).toBe('MarkuprPlus v3.0.0');
  });
});
