/**
 * Linear Template — Linear-compatible Markdown
 *
 * Produces clean Markdown suitable for Linear issue descriptions.
 * Linear supports standard Markdown with some limitations (no HTML).
 */

import type { OutputTemplate, TemplateContext, TemplateOutput } from './types';
import {
  formatTimestamp,
  formatDate,
  computeSessionDuration,
  generateSegmentTitle,
  computeRelativeFramePath,
  mapFramesToSegments,
} from './helpers';
import { renderMarkedIssuesMarkdown } from '../MarkedIssueReportBuilder';
import { PUBLIC_BRAND_NAME, PUBLIC_WEBSITE_URL } from '../../../shared/publicBrand';

export const linearTemplate: OutputTemplate = {
  name: 'linear',
  description: 'Linear-compatible Markdown for issue descriptions',
  fileExtension: '.md',

  render(context: TemplateContext): TemplateOutput {
    const { result, sessionDir, timestamp } = context;
    const { transcriptSegments, extractedFrames, markedIssues = [] } = result;
    const ordinaryFrames = extractedFrames.filter((frame) => !frame.markedIssueId);
    const sessionTimestamp = formatDate(new Date(timestamp ?? Date.now()));
    const duration = computeSessionDuration(transcriptSegments);

    let md = `**Feedback Report** — ${sessionTimestamp}\n`;
    md += `${transcriptSegments.length} segments | ${extractedFrames.length} frames | Duration: ${duration}\n\n`;
    if (markedIssues.length > 0) {
      md += renderMarkedIssuesMarkdown(markedIssues, './screenshots');
    }

    if (transcriptSegments.length === 0) {
      md += `_No feedback was captured during this recording._\n\n`;
      md += `---\n_Captured by [${PUBLIC_BRAND_NAME}](${PUBLIC_WEBSITE_URL})_\n`;
      return { content: md, fileExtension: '.md' };
    }

    // Task list for quick triage
    md += `**Action Items**\n\n`;
    for (const segment of transcriptSegments) {
      const title = generateSegmentTitle(segment.text);
      md += `- [ ] ${title}\n`;
    }
    md += `\n---\n\n`;

    // Each segment as a section
    const segmentFrameMap = mapFramesToSegments(transcriptSegments, ordinaryFrames);

    for (let i = 0; i < transcriptSegments.length; i++) {
      const segment = transcriptSegments[i];
      const formattedTime = formatTimestamp(segment.startTime);
      const title = generateSegmentTitle(segment.text);

      md += `### [${formattedTime}] ${title}\n\n`;
      md += `> ${segment.text}\n\n`;

      const frames = segmentFrameMap.get(i);
      if (frames && frames.length > 0) {
        for (const frame of frames) {
          const relativePath = computeRelativeFramePath(frame.path, sessionDir);
          md += `![Screenshot](${relativePath})\n\n`;
        }
      }
    }

    md += `---\n_Captured by [${PUBLIC_BRAND_NAME}](${PUBLIC_WEBSITE_URL})_\n`;

    return { content: md, fileExtension: '.md' };
  },
};
