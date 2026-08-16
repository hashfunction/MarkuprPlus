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

  it('preserves separate marked issue identities into fallback extracted frames', async () => {
    const hints: KeyMoment[] = [
      {
        timestamp: 3.1,
        reason: 'Marked issue MX-001',
        confidence: 1,
        markedIssueId: 'marked-issue-001',
      },
      {
        timestamp: 3.15,
        reason: 'Marked issue MX-002',
        confidence: 1,
        markedIssueId: 'marked-issue-002',
      },
    ];
    const analyzer = { analyze: vi.fn(() => hints) } as unknown as TranscriptAnalyzer;
    const extractor = {
      extract: vi.fn(() => Promise.resolve({
        ffmpegAvailable: true,
        frames: hints.map((hint, index) => ({
          path: `/tmp/frames/marked-issue-00${index + 1}.png`,
          timestamp: hint.timestamp,
          success: true,
          markedIssueId: hint.markedIssueId,
        })),
      })),
    } as unknown as FrameExtractor;
    const processor = new PostProcessor(analyzer, extractor);

    const result = await processor.process({
      videoPath: '/tmp/recording.webm',
      audioPath: '',
      sessionDir: '/tmp/report',
      aiMomentHints: hints,
    });

    expect(extractor.extract).toHaveBeenCalledWith({
      videoPath: '/tmp/recording.webm',
      timestamps: [3.1, 3.15],
      moments: hints,
      outputDir: '/tmp/report',
    });
    expect(result.extractedFrames.map((frame) => frame.markedIssueId)).toEqual([
      'marked-issue-001',
      'marked-issue-002',
    ]);
  });
});
