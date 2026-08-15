import { describe, expect, it, vi } from 'vitest';
import { PostProcessor } from '../../src/main/pipeline/PostProcessor';
import type { KeyMoment, TranscriptAnalyzer } from '../../src/main/pipeline/TranscriptAnalyzer';
import type { FrameExtractor } from '../../src/main/pipeline/FrameExtractor';

describe('PostProcessor annotation-only frames', () => {
  it('extracts an annotated video frame even when no transcript is available', async () => {
    const hint: KeyMoment = {
      timestamp: 3.15,
      reason: 'Annotation completed: circle',
      confidence: 1,
    };
    const analyzer = {
      analyze: vi.fn(() => [hint]),
    } as unknown as TranscriptAnalyzer;
    const extractor = {
      extract: vi.fn(() => Promise.resolve({
        ffmpegAvailable: true,
        frames: [{ path: '/tmp/frames/frame-001.png', timestamp: 3.15, success: true }],
      })),
    } as unknown as FrameExtractor;
    const processor = new PostProcessor(analyzer, extractor);

    const result = await processor.process({
      videoPath: '/tmp/recording.webm',
      audioPath: '',
      sessionDir: '/tmp/report',
      aiMomentHints: [hint],
    });

    expect(analyzer.analyze).toHaveBeenCalledWith([], [hint]);
    expect(extractor.extract).toHaveBeenCalledWith({
      videoPath: '/tmp/recording.webm',
      timestamps: [3.15],
      outputDir: '/tmp/report',
    });
    expect(result.extractedFrames).toEqual([{
      path: '/tmp/frames/frame-001.png',
      timestamp: 3.15,
      reason: 'Annotation completed: circle',
      transcriptSegment: undefined,
    }]);
  });
});
