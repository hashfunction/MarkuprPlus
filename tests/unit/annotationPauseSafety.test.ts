import { describe, expect, it, vi } from 'vitest';
import { disableAnnotationDrawing } from '../../src/renderer/capture/annotationPauseSafety';

describe('disableAnnotationDrawing', () => {
  it('forces an active overlay back to click-through interaction mode', async () => {
    const setAnnotationMode = vi.fn().mockResolvedValue({ success: true });
    const endAnnotation = vi.fn().mockResolvedValue({ success: true });

    const ended = await disableAnnotationDrawing({
      annotationActive: true,
      setAnnotationMode,
      endAnnotation,
    });

    expect(setAnnotationMode).toHaveBeenCalledWith('interact');
    expect(endAnnotation).not.toHaveBeenCalled();
    expect(ended).toBe(false);
  });

  it('tears down the overlay if interaction mode cannot be restored', async () => {
    const setAnnotationMode = vi.fn().mockResolvedValue({ success: false, error: 'gone' });
    const endAnnotation = vi.fn().mockResolvedValue({ success: true });

    const ended = await disableAnnotationDrawing({
      annotationActive: true,
      setAnnotationMode,
      endAnnotation,
    });

    expect(endAnnotation).toHaveBeenCalledOnce();
    expect(ended).toBe(true);
  });
});
