import { describe, expect, it, vi } from 'vitest';
import { cleanupFailedRecordingStart } from '../../src/renderer/capture/recordingFailureCleanup';

describe('cleanupFailedRecordingStart', () => {
  it('releases capture and cancels the owning session when exact-source startup fails', async () => {
    const releaseCaptureTracks = vi.fn();
    const endAnnotation = vi.fn().mockRejectedValue(new Error('overlay already gone'));
    const cancelSession = vi.fn().mockResolvedValue({ success: true });

    await cleanupFailedRecordingStart({ releaseCaptureTracks, endAnnotation, cancelSession });

    expect(releaseCaptureTracks).toHaveBeenCalledOnce();
    expect(endAnnotation).toHaveBeenCalledOnce();
    expect(cancelSession).toHaveBeenCalledOnce();
  });
});
