import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CapturePoint,
  CaptureSelectionOverlayState,
} from '../../shared/types';
import {
  createSelectionState,
  reduceSelection,
  windowTargetFromSource,
  type SelectionAction,
  type SelectionEffect,
  type SelectionMode,
  type SelectionState,
} from './selectionModel';

interface SelectionOverlayProps {
  overlayState: CaptureSelectionOverlayState;
}

const MODE_COPY: Record<SelectionMode, string> = {
  window: 'Move over a window and click to record only that application.',
  region: 'Drag any area on this display. Release to start recording.',
  screen: 'Click anywhere to record this entire display.',
};

function toGlobalPoint(event: React.PointerEvent, state: CaptureSelectionOverlayState): CapturePoint {
  return {
    x: event.clientX + state.display.bounds.x,
    y: event.clientY + state.display.bounds.y,
  };
}

function localRect(
  bounds: { x: number; y: number; width: number; height: number },
  displayBounds: CaptureSelectionOverlayState['display']['bounds'],
): React.CSSProperties {
  return {
    left: bounds.x - displayBounds.x,
    top: bounds.y - displayBounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function SelectionOverlay({ overlayState }: SelectionOverlayProps): React.ReactElement {
  const [selection, setSelection] = useState<SelectionState>(() => createSelectionState(overlayState.mode));
  const selectionRef = useRef(selection);
  const [busy, setBusy] = useState(false);

  const hoveredWindow = useMemo(
    () => overlayState.windows.find((window) => window.sourceId === selection.hoveredSourceId) || null,
    [overlayState.windows, selection.hoveredSourceId],
  );

  const dragRect = useMemo(() => {
    if (!selection.dragStart || !selection.dragCurrent) return null;
    const left = Math.max(
      overlayState.display.bounds.x,
      Math.min(selection.dragStart.x, selection.dragCurrent.x),
    );
    const top = Math.max(
      overlayState.display.bounds.y,
      Math.min(selection.dragStart.y, selection.dragCurrent.y),
    );
    const right = Math.min(
      overlayState.display.bounds.x + overlayState.display.bounds.width,
      Math.max(selection.dragStart.x, selection.dragCurrent.x),
    );
    const bottom = Math.min(
      overlayState.display.bounds.y + overlayState.display.bounds.height,
      Math.max(selection.dragStart.y, selection.dragCurrent.y),
    );
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }, [overlayState.display.bounds, selection.dragCurrent, selection.dragStart]);

  const applyEffect = useCallback(async (effect: SelectionEffect | null) => {
    if (!effect || busy) return;
    if (effect.type === 'cancel') {
      setBusy(true);
      await window.markupr.captureOverlay.cancel();
      return;
    }
    setBusy(true);
    const result = await window.markupr.captureOverlay.confirmTarget(effect.target);
    if (!result.success) {
      const next = { ...selectionRef.current, error: result.error || 'That source is no longer available.' };
      selectionRef.current = next;
      setSelection(next);
      setBusy(false);
    }
  }, [busy]);

  const act = useCallback((action: SelectionAction) => {
    if (busy) return;
    const result = reduceSelection(selectionRef.current, action, {
      display: overlayState.display,
      windows: overlayState.windows,
    });
    selectionRef.current = result.state;
    setSelection(result.state);
    void applyEffect(result.effect);
  }, [applyEffect, busy, overlayState.display, overlayState.windows]);

  useEffect(() => {
    if (selectionRef.current.mode === overlayState.mode) return;
    const next = reduceSelection(
      selectionRef.current,
      { type: 'set-mode', mode: overlayState.mode },
      { display: overlayState.display, windows: overlayState.windows },
    ).state;
    selectionRef.current = next;
    setSelection(next);
  }, [overlayState.display, overlayState.mode, overlayState.windows]);

  const setMode = useCallback(async (mode: SelectionMode) => {
    if (busy) return;
    const result = await window.markupr.captureOverlay.setSelectionMode(mode);
    if (!result.success) {
      const next = { ...selectionRef.current, error: result.error || 'Unable to change capture mode.' };
      selectionRef.current = next;
      setSelection(next);
    }
  }, [busy]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') act({ type: 'cancel' });
      if (event.key.toLowerCase() === 'w') void setMode('window');
      if (event.key.toLowerCase() === 'r') void setMode('region');
      if (event.key.toLowerCase() === 's') void setMode('screen');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [act, setMode]);

  const confirmGallerySource = async (source: CaptureSelectionOverlayState['windowSources'][number]) => {
    if (busy) return;
    await applyEffect({ type: 'confirm', target: windowTargetFromSource(source, overlayState.display) });
  };

  return (
    <main
      aria-label="Choose what markupR should record"
      onPointerMove={(event) => act({ type: 'pointer-move', point: toGlobalPoint(event, overlayState) })}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('[data-selector-control]')) return;
        if (selection.mode === 'region') event.currentTarget.setPointerCapture(event.pointerId);
        act({ type: 'pointer-down', point: toGlobalPoint(event, overlayState) });
      }}
      onPointerUp={(event) => {
        if ((event.target as HTMLElement).closest('[data-selector-control]')) return;
        act({ type: 'pointer-up', point: toGlobalPoint(event, overlayState) });
      }}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: selection.mode === 'screen' ? 'rgba(10, 132, 255, 0.13)' : 'rgba(5, 8, 14, 0.48)',
        color: '#fff',
        cursor: selection.mode === 'region' ? 'crosshair' : 'default',
        userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {hoveredWindow && selection.mode === 'window' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            ...localRect(hoveredWindow.bounds, overlayState.display.bounds),
            border: '3px solid #0a84ff',
            borderRadius: 10,
            background: 'rgba(10, 132, 255, 0.08)',
            boxShadow: '0 0 0 1px rgba(255,255,255,.9), 0 8px 30px rgba(0,0,0,.35)',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute',
            left: 8,
            top: 8,
            maxWidth: 'calc(100% - 16px)',
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(8, 12, 20, .88)',
            fontSize: 13,
            fontWeight: 650,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {hoveredWindow.appName} · {hoveredWindow.sourceName}
          </span>
        </div>
      )}

      {dragRect && selection.mode === 'region' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            ...localRect(dragRect, overlayState.display.bounds),
            border: '2px solid #fff',
            background: 'rgba(10, 132, 255, .18)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,.22), 0 0 0 1px #0a84ff',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute',
            right: 0,
            bottom: -30,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(8,12,20,.9)',
            fontSize: 12,
          }}>
            {Math.round(dragRect.width)} × {Math.round(dragRect.height)}
          </span>
        </div>
      )}

      <section
        data-selector-control
        aria-live="polite"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          width: 'min(680px, calc(100vw - 32px))',
          padding: 12,
          border: '1px solid rgba(255,255,255,.22)',
          borderRadius: 15,
          background: 'rgba(17, 23, 34, .94)',
          boxShadow: '0 18px 50px rgba(0,0,0,.42)',
          backdropFilter: 'blur(24px)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,.82)' }}>
          {MODE_COPY[selection.mode]}
        </p>

        {selection.mode === 'window' && overlayState.windows.length === 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 0 10px' }}>
            {overlayState.windowSources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => { void confirmGallerySource(source); }}
                style={{
                  flex: '0 0 132px',
                  padding: 7,
                  color: '#fff',
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.16)',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                {source.thumbnail && <img src={source.thumbnail} alt="" style={{ width: 116, height: 68, objectFit: 'cover', borderRadius: 6 }} />}
                <span style={{ display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                  {source.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 7 }}>
          {(['window', 'region', 'screen'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={selection.mode === mode}
              onClick={() => { void setMode(mode); }}
              style={{
                padding: '8px 12px',
                borderRadius: 9,
                border: selection.mode === mode ? '1px solid #69b4ff' : '1px solid rgba(255,255,255,.16)',
                background: selection.mode === mode ? '#0a84ff' : 'rgba(255,255,255,.07)',
                color: '#fff',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              {mode === 'window' ? 'Window  W' : mode === 'region' ? 'Region  R' : 'Full Screen  S'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => act({ type: 'cancel' })}
            style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.16)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Cancel  Esc
          </button>
        </div>
        {selection.error && <p role="alert" style={{ margin: '9px 0 0', color: '#ff9f8f', fontSize: 12 }}>{selection.error}</p>}
      </section>
    </main>
  );
}

export default SelectionOverlay;
