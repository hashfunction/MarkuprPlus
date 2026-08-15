import { describe, expect, it } from 'vitest';
import type { CaptureContextSnapshot } from '../../src/shared/types';
import {
  captureContextsToKeyMoments,
  nearestCaptureContext,
} from '../../src/main/pipeline/CaptureMomentHints';

const annotationContext: CaptureContextSnapshot = {
  recordedAt: 11_000,
  trigger: 'annotation',
  annotation: { strokeId: 'stroke-1', tool: 'circle', color: '#ff3b30' },
};

describe('CaptureMomentHints', () => {
  it('places annotation frames just after stroke completion relative to video start', () => {
    expect(captureContextsToKeyMoments([annotationContext], 10_000)).toEqual([{
      timestamp: 1.15,
      reason: 'Annotation completed: circle',
      confidence: 1,
    }]);
  });

  it('ignores non-annotation and malformed contexts and clamps pre-roll timestamps', () => {
    const contexts: CaptureContextSnapshot[] = [
      { recordedAt: 10_100, trigger: 'manual' },
      { ...annotationContext, recordedAt: Number.NaN },
      { ...annotationContext, recordedAt: 9_000 },
    ];

    expect(captureContextsToKeyMoments(contexts, 10_000)).toEqual([{
      timestamp: 0.15,
      reason: 'Annotation completed: circle',
      confidence: 1,
    }]);
    expect(captureContextsToKeyMoments([annotationContext], Number.NaN)).toEqual([]);
  });

  it('matches extracted frames against video time rather than earlier session setup time', () => {
    const contexts: CaptureContextSnapshot[] = [
      annotationContext,
      { ...annotationContext, recordedAt: 14_000, annotation: { ...annotationContext.annotation!, strokeId: 'stroke-2' } },
    ];

    expect(nearestCaptureContext(1.15, 10_000, contexts, 500)?.annotation?.strokeId).toBe('stroke-1');
    expect(nearestCaptureContext(1.15, 8_000, contexts, 500)).toBeUndefined();
  });
});
