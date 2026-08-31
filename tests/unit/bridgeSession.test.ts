import { describe, expect, it } from 'vitest';
import type { Session } from '../../src/main/SessionController';
import {
  deserializeBridgeSession,
  serializeBridgeSession,
} from '../../src/bridge/BridgeSession';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

describe('bridge session transport', () => {
  it('round-trips analyzer input while removing filesystem paths', () => {
    const session: Session = {
      id: 'session-1',
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_010_000,
      state: 'complete',
      sourceId: 'window:1:0',
      feedbackItems: [{
        id: 'feedback-1',
        timestamp: 1_700_000_002_000,
        text: 'The button is clipped.',
        confidence: 0.92,
      }],
      transcriptBuffer: [{
        text: 'The button is clipped.',
        isFinal: true,
        confidence: 0.92,
        timestamp: 1_700_000_002,
        tier: 'whisper',
      }],
      screenshotBuffer: [{
        id: 'shot-1',
        timestamp: 1_700_000_002_000,
        buffer: png,
        width: 1280,
        height: 720,
      }],
      metadata: {
        sourceId: 'window:1:0',
        sourceName: 'Example App',
        sourceType: 'window',
        recordingPath: '/Users/example/private/session.webm',
        audioPath: '/Users/example/private/session.wav',
        markedIssues: [{
          id: 'issue-1',
          ordinal: 1,
          startedAt: 1_700_000_001_000,
          markedAt: 1_700_000_002_000,
          completedAt: 1_700_000_003_000,
          strokeIds: ['stroke-1'],
          tools: ['circle'],
          colors: ['#ff3b30'],
          screenshotPath: '/Users/example/private/shot.png',
          fallbackVideoTimestamp: 2_000,
          comment: 'The button is clipped.',
          transcriptionStatus: 'available',
          snapshotRevision: 1,
          transcriptSegmentIds: ['transcript-segment-0001'],
        }],
      },
    };

    const payload = serializeBridgeSession(session);
    const encoded = JSON.stringify(payload);

    expect(encoded).not.toContain('/Users/example');
    expect(encoded).not.toContain('recordingPath');
    expect(encoded).not.toContain('audioPath');
    expect(encoded).not.toContain('screenshotPath');
    expect(payload.screenshots[0]).toMatchObject({
      id: 'shot-1',
      mimeType: 'image/png',
      dataBase64: png.toString('base64'),
    });

    const restored = deserializeBridgeSession(payload);
    expect(restored).toMatchObject({
      id: 'session-1',
      sourceId: 'window:1:0',
      state: 'complete',
      metadata: {
        sourceName: 'Example App',
        markedIssues: [{ id: 'issue-1', comment: 'The button is clipped.' }],
      },
      transcriptBuffer: [{ text: 'The button is clipped.', isFinal: true }],
    });
    expect(restored.screenshotBuffer[0].buffer).toEqual(png);
  });

  it('detects JPEG screenshot bytes without trusting a caller-provided path', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const session: Session = {
      id: 'jpeg-session',
      startTime: 10,
      state: 'complete',
      sourceId: 'screen:0:0',
      feedbackItems: [],
      transcriptBuffer: [],
      screenshotBuffer: [{
        id: 'jpeg-shot', timestamp: 20, buffer: jpeg, width: 10, height: 10,
      }],
      metadata: { sourceId: 'screen:0:0', sourceName: 'Screen' },
    };

    expect(serializeBridgeSession(session).screenshots[0].mimeType).toBe('image/jpeg');
  });
});
