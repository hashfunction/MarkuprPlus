import type {
  AnnotationEvent,
  CaptureContextSnapshot,
  CaptureTarget,
} from '../../shared/types';

export type CaptureSourceType = CaptureTarget['kind'];

export function captureSourceType(target: CaptureTarget): CaptureSourceType {
  return target.kind;
}

export async function resolveCaptureTarget(
  explicitTarget: CaptureTarget | undefined,
  selectTarget: () => Promise<CaptureTarget | null>,
): Promise<CaptureTarget | null> {
  if (explicitTarget) return explicitTarget;
  return selectTarget();
}

interface PendingStroke {
  sessionId: string;
  strokeId: string;
  tool: NonNullable<CaptureContextSnapshot['annotation']>['tool'];
  color: NonNullable<CaptureContextSnapshot['annotation']>['color'];
}

export class AnnotationCueTracker {
  private pending = new Map<string, PendingStroke>();

  consume(event: AnnotationEvent, recordedAt = Date.now()): CaptureContextSnapshot | null {
    if (event.type === 'stroke-start') {
      this.pending.set(this.key(event.sessionId, event.stroke.id), {
        sessionId: event.sessionId,
        strokeId: event.stroke.id,
        tool: event.stroke.tool,
        color: event.stroke.color,
      });
      return null;
    }

    if (event.type === 'clear') {
      for (const [key, stroke] of this.pending) {
        if (stroke.sessionId === event.sessionId) this.pending.delete(key);
      }
      return null;
    }

    if (event.type === 'mode' && event.mode === 'interact') {
      for (const [key, stroke] of this.pending) {
        if (stroke.sessionId === event.sessionId) this.pending.delete(key);
      }
      return null;
    }

    if (event.type !== 'stroke-end') return null;
    const key = this.key(event.sessionId, event.strokeId);
    const stroke = this.pending.get(key);
    if (!stroke) return null;
    this.pending.delete(key);
    return {
      recordedAt,
      trigger: 'annotation',
      annotation: {
        strokeId: stroke.strokeId,
        tool: stroke.tool,
        color: stroke.color,
      },
    };
  }

  clear(): void {
    this.pending.clear();
  }

  private key(sessionId: string, strokeId: string): string {
    return `${sessionId}\u0000${strokeId}`;
  }
}
