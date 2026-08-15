import type {
  CapturableWindow,
  CaptureDisplay,
  CapturePoint,
  CaptureSource,
  CaptureSelectionMode,
  CaptureTarget,
} from '../../shared/types';
import { findWindowAtPoint, normalizeRegion } from '../../shared/captureGeometry';

export type SelectionMode = CaptureSelectionMode;

export interface SelectionState {
  mode: SelectionMode;
  hoveredSourceId: string | null;
  dragStart: CapturePoint | null;
  dragCurrent: CapturePoint | null;
  error: string | null;
}

export type SelectionAction =
  | { type: 'set-mode'; mode: SelectionMode }
  | { type: 'pointer-move'; point: CapturePoint }
  | { type: 'pointer-down'; point: CapturePoint }
  | { type: 'pointer-up'; point: CapturePoint }
  | { type: 'cancel' };

export type SelectionEffect =
  | { type: 'confirm'; target: CaptureTarget }
  | { type: 'cancel' };

interface SelectionContext {
  display: CaptureDisplay;
  windows: CapturableWindow[];
}

export interface SelectionResult {
  state: SelectionState;
  effect: SelectionEffect | null;
}

export function createSelectionState(mode: SelectionMode = 'window'): SelectionState {
  return {
    mode,
    hoveredSourceId: null,
    dragStart: null,
    dragCurrent: null,
    error: null,
  };
}

function windowTarget(window: CapturableWindow): CaptureTarget {
  return {
    kind: 'window',
    sourceId: window.sourceId,
    sourceName: window.sourceName,
    nativeWindowId: window.nativeWindowId,
    appName: window.appName,
    bounds: window.bounds,
    geometryAvailable: true,
  };
}

export function windowTargetFromSource(
  source: CaptureSource,
  display: CaptureDisplay,
): CaptureTarget {
  const nativeWindowId = /^window:([^:]+):[01]$/.exec(source.id)?.[1] || source.id;
  return {
    kind: 'window',
    sourceId: source.id,
    sourceName: source.name,
    nativeWindowId,
    appName: source.name || 'Application',
    bounds: display.bounds,
    geometryAvailable: false,
  };
}

export function reduceSelection(
  state: SelectionState,
  action: SelectionAction,
  context: SelectionContext,
): SelectionResult {
  if (action.type === 'cancel') return { state, effect: { type: 'cancel' } };

  if (action.type === 'set-mode') {
    return {
      state: {
        ...createSelectionState(),
        mode: action.mode,
      },
      effect: null,
    };
  }

  if (action.type === 'pointer-move') {
    if (state.mode === 'window') {
      const hovered = findWindowAtPoint(context.windows, action.point);
      return {
        state: { ...state, hoveredSourceId: hovered?.sourceId || null, error: null },
        effect: null,
      };
    }
    if (state.mode === 'region' && state.dragStart) {
      return { state: { ...state, dragCurrent: action.point, error: null }, effect: null };
    }
    return { state, effect: null };
  }

  if (action.type === 'pointer-down') {
    if (state.mode === 'window') {
      const selected = context.windows.find((window) => window.sourceId === state.hoveredSourceId)
        || findWindowAtPoint(context.windows, action.point);
      return selected
        ? { state, effect: { type: 'confirm', target: windowTarget(selected) } }
        : { state: { ...state, error: 'Move over an application window to select it.' }, effect: null };
    }
    if (state.mode === 'screen') {
      return {
        state,
        effect: {
          type: 'confirm',
          target: {
            kind: 'screen',
            sourceId: context.display.sourceId,
            sourceName: context.display.sourceName,
            displayId: context.display.id,
            displayBounds: context.display.bounds,
            scaleFactor: context.display.scaleFactor,
          },
        },
      };
    }
    return {
      state: { ...state, dragStart: action.point, dragCurrent: action.point, error: null },
      effect: null,
    };
  }

  if (state.mode !== 'region' || !state.dragStart) return { state, effect: null };
  const region = normalizeRegion(state.dragStart, action.point, context.display.bounds);
  if (!region) {
    return {
      state: { ...state, dragStart: null, dragCurrent: null, error: 'Drag an area at least 32 × 32 pixels.' },
      effect: null,
    };
  }

  return {
    state: { ...state, dragCurrent: action.point, error: null },
    effect: {
      type: 'confirm',
      target: {
        kind: 'region',
        sourceId: context.display.sourceId,
        sourceName: `${context.display.label} — Selected Region`,
        displayId: context.display.id,
        displayBounds: context.display.bounds,
        scaleFactor: context.display.scaleFactor,
        region,
      },
    },
  };
}
