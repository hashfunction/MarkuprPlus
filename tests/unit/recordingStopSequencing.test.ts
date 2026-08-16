import { describe, expect, it, vi } from 'vitest';
import { stopRecordingWithMarkedIssue } from '../../src/renderer/capture/recordingStopSequencing';

describe('recording stop sequencing', () => {
  it('finalizes, awaits the exact snapshot, stops persistence, then releases tracks', async () => {
    const order: string[] = [];
    const result = await stopRecordingWithMarkedIssue({
      annotationActive: true,
      finalizePendingIssue: true,
      endAnnotation: vi.fn(async (finalize) => {
        order.push(`annotation:${String(finalize)}`);
        return { success: true, snapshotRevision: 7 };
      }),
      waitForMarkedSnapshot: vi.fn(async (revision) => {
        order.push(`snapshot:${revision}`);
        return true;
      }),
      stopRecorder: vi.fn(async () => {
        order.push('recorder');
        return { success: true, path: '/tmp/session.webm' };
      }),
      releaseCaptureTracks: vi.fn(() => order.push('release')),
    });

    expect(result).toEqual({ success: true, path: '/tmp/session.webm' });
    expect(order).toEqual(['annotation:true', 'snapshot:7', 'recorder', 'release']);
  });

  it('ends without committing on non-stop teardown and skips an absent snapshot', async () => {
    const order: string[] = [];
    await stopRecordingWithMarkedIssue({
      annotationActive: true,
      finalizePendingIssue: false,
      endAnnotation: vi.fn(async (finalize) => {
        order.push(`annotation:${String(finalize)}`);
        return { success: true };
      }),
      waitForMarkedSnapshot: vi.fn(async () => true),
      stopRecorder: vi.fn(async () => {
        order.push('recorder');
        return { success: true };
      }),
      releaseCaptureTracks: vi.fn(() => order.push('release')),
    });

    expect(order).toEqual(['annotation:false', 'recorder', 'release']);
  });

  it('still stops and releases when finalization or snapshot waiting fails', async () => {
    const order: string[] = [];
    await stopRecordingWithMarkedIssue({
      annotationActive: true,
      finalizePendingIssue: true,
      endAnnotation: vi.fn(async () => {
        order.push('annotation');
        return { success: false, snapshotRevision: 4 };
      }),
      waitForMarkedSnapshot: vi.fn(async () => {
        order.push('snapshot');
        throw new Error('renderer crashed');
      }),
      stopRecorder: vi.fn(async () => {
        order.push('recorder');
        return { success: false, error: 'disk full' };
      }),
      releaseCaptureTracks: vi.fn(() => order.push('release')),
    });

    expect(order).toEqual(['annotation', 'snapshot', 'recorder', 'release']);
  });
});
