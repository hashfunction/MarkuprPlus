import type {
  AnnotationInputHealth,
  GlobalAnnotationInputMonitor,
} from '../capture/GlobalAnnotationInputMonitor';
import type { GlobalAnnotationInputSample } from '../capture/annotationInputModel';
import type {
  CapturableWindow,
  CaptureBounds,
  CaptureDisplay,
  CaptureSource,
} from '../../shared/types';
export { ELECTRON_TEST_CHANNELS } from '../../shared/electronTestHarness';

export function isElectronTestHarnessAllowed(options: {
  requested: boolean;
  isPackaged: boolean;
}): boolean {
  return options.requested && !options.isPackaged;
}

export function getElectronTestReviewSaveDelay(options: {
  requested: boolean;
  isPackaged: boolean;
  value: string | undefined;
}): number {
  if (!isElectronTestHarnessAllowed(options)) {
    return 0;
  }

  const parsed = Number(options.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.min(2_000, Math.floor(parsed));
}

export interface ElectronTestDisplayLike {
  id: string | number;
  label?: string;
  bounds: CaptureBounds;
  scaleFactor: number;
}

export function createElectronTestCaptureFixtures(displayLike: ElectronTestDisplayLike): {
  display: CaptureDisplay;
  window: CapturableWindow;
  windowSource: CaptureSource;
} {
  const bounds = { ...displayLike.bounds };
  const horizontalInset = Math.min(80, Math.max(0, Math.floor(bounds.width / 8)));
  const verticalInset = Math.min(80, Math.max(0, Math.floor(bounds.height / 8)));
  const windowBounds: CaptureBounds = {
    x: bounds.x + horizontalInset,
    y: bounds.y + verticalInset,
    width: Math.max(32, Math.min(800, bounds.width - horizontalInset * 2)),
    height: Math.max(32, Math.min(500, bounds.height - verticalInset * 2)),
  };
  const sourceId = 'window:e2e:0';
  const sourceName = 'Fixture Review Screen';

  return {
    display: {
      id: String(displayLike.id),
      label: displayLike.label || 'MarkuprX Test Display',
      sourceId: 'screen:e2e:0',
      sourceName: 'MarkuprX Test Display',
      bounds,
      scaleFactor: displayLike.scaleFactor,
      isPrimary: true,
    },
    window: {
      sourceId,
      sourceName,
      nativeWindowId: 'e2e',
      appName: 'MarkuprX Test Fixture',
      bounds: windowBounds,
      ownerPid: process.pid,
    },
    windowSource: {
      id: sourceId,
      name: sourceName,
      type: 'window',
    },
  };
}

function isValidSample(sample: unknown): sample is GlobalAnnotationInputSample {
  if (!sample || typeof sample !== 'object') return false;
  const candidate = sample as Partial<GlobalAnnotationInputSample>;
  return Number.isSafeInteger(candidate.sequence)
    && Number(candidate.sequence) >= 0
    && typeof candidate.modifierDown === 'boolean'
    && typeof candidate.primaryDown === 'boolean'
    && Boolean(candidate.cursor)
    && Number.isFinite(candidate.cursor?.x)
    && Number.isFinite(candidate.cursor?.y)
    && Number.isFinite(candidate.capturedAt)
    && Number(candidate.capturedAt) >= 0;
}

export class ElectronTestInputMonitor implements GlobalAnnotationInputMonitor {
  private listener: ((sample: GlobalAnnotationInputSample) => void) | null = null;
  private lastSequence = -1;
  private status: AnnotationInputHealth;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {
    this.status = { state: 'idle', platform, restartCount: 0 };
  }

  async start(listener: (sample: GlobalAnnotationInputSample) => void): Promise<void> {
    this.listener = listener;
    this.lastSequence = -1;
    this.status = { state: 'running', platform: this.platform, restartCount: 0 };
  }

  async stop(): Promise<void> {
    this.listener = null;
    this.lastSequence = -1;
    this.status = { state: 'idle', platform: this.platform, restartCount: 0 };
  }

  health(): AnnotationInputHealth {
    return { ...this.status };
  }

  inject(sample: unknown): { success: boolean; error?: string } {
    if (this.status.state !== 'running' || !this.listener) {
      return { success: false, error: 'Test input monitor is not running.' };
    }
    if (!isValidSample(sample)) {
      return { success: false, error: 'Invalid annotation input sample.' };
    }
    if (sample.sequence <= this.lastSequence) {
      return { success: false, error: 'Input sequence must increase.' };
    }

    this.lastSequence = sample.sequence;
    this.listener(structuredClone(sample));
    return { success: true };
  }

  setAvailable(available: boolean, error = 'Injected observer failure.'): void {
    this.status = available
      ? { state: 'running', platform: this.platform, restartCount: 0 }
      : { state: 'failed', platform: this.platform, restartCount: 0, error };
  }
}

export const electronTestInputMonitor = new ElectronTestInputMonitor();
