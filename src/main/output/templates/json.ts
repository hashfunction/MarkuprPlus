/**
 * JSON Template — Structured machine-readable output
 *
 * Produces a JSON document with segments, frames, and metadata.
 * Designed for programmatic consumption by CI tools and APIs.
 */

import type { OutputTemplate, TemplateContext, TemplateOutput } from './types';
import { computeRelativeFramePath, computeSessionDuration, mapFramesToSegments } from './helpers';

export const jsonTemplate: OutputTemplate = {
  name: 'json',
  description: 'Structured JSON output for programmatic consumption',
  fileExtension: '.json',

  render(context: TemplateContext): TemplateOutput {
    const { result, sessionDir, timestamp } = context;
    const { transcriptSegments, extractedFrames } = result;

    const segmentFrameMap = mapFramesToSegments(transcriptSegments, extractedFrames);

    const output = {
      version: '1.0',
      generator: 'MarkuprX',
      timestamp: new Date(timestamp ?? Date.now()).toISOString(),
      summary: {
        segments: transcriptSegments.length,
        frames: extractedFrames.length,
        duration: computeSessionDuration(transcriptSegments),
      },
      markedIssues: structuredClone(result.markedIssues ?? []),
      segments: transcriptSegments.map((segment, i) => {
        const frames = segmentFrameMap.get(i) || [];
        return {
          text: segment.text,
          startTime: segment.startTime,
          endTime: segment.endTime,
          confidence: segment.confidence,
          frames: frames.map((f) => ({
            path: computeRelativeFramePath(f.path, sessionDir),
            timestamp: f.timestamp,
            reason: f.reason,
            captureContext: f.captureContext,
          })),
        };
      }),
    };

    return {
      content: JSON.stringify(output, null, 2),
      fileExtension: '.json',
    };
  },
};
