import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnnotationColor,
  AnnotationEvent,
  AnnotationTool,
  CaptureAnnotationOverlayState,
} from '../../shared/types';
import {
  createAnnotationScene,
  drawAnnotationScene,
  reduceAnnotationEvent,
  type AnnotationScene,
} from '../capture/annotationScene';
import {
  createAnnotationOverlayModel,
  normalizeOverlayPoint,
  reduceAnnotationOverlay,
  type AnnotationOverlayAction,
  type AnnotationOverlayModel,
} from './annotationOverlayModel';

interface LiveAnnotationOverlayProps {
  overlayState: CaptureAnnotationOverlayState;
}

const TOOLS: Array<{ tool: AnnotationTool; label: string }> = [
  { tool: 'freehand', label: 'Pen' },
  { tool: 'circle', label: 'Circle' },
  { tool: 'highlight', label: 'Highlight' },
];
const COLORS: AnnotationColor[] = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff'];

function nextStrokeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function LiveAnnotationOverlay({ overlayState }: LiveAnnotationOverlayProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<AnnotationScene>(createAnnotationScene());
  const modelRef = useRef<AnnotationOverlayModel>(createAnnotationOverlayModel(overlayState.sessionId));
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());
  const [model, setModel] = useState(modelRef.current);

  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const physicalWidth = Math.round(width * pixelRatio);
    const physicalHeight = Math.round(height * pixelRatio);
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawAnnotationScene(context, sceneRef.current, { width, height });
  }, []);

  useEffect(() => {
    const onResize = () => renderScene();
    window.addEventListener('resize', onResize);
    renderScene();
    return () => window.removeEventListener('resize', onResize);
  }, [renderScene]);

  useEffect(() => {
    const result = reduceAnnotationOverlay(modelRef.current, {
      type: 'set-mode',
      mode: overlayState.mode,
    });
    modelRef.current = result.model;
    setModel(result.model);
  }, [overlayState.mode]);

  useEffect(() => window.markupr.capture.onAnnotationEvent((event: AnnotationEvent) => {
    if (event.sessionId !== overlayState.sessionId) return;
    sceneRef.current = reduceAnnotationEvent(sceneRef.current, event);
    if (event.type === 'mode') {
      const result = reduceAnnotationOverlay(modelRef.current, { type: 'set-mode', mode: event.mode });
      modelRef.current = result.model;
      setModel(result.model);
    }
    renderScene();
  }), [overlayState.sessionId, renderScene]);

  const dispatch = useCallback((action: AnnotationOverlayAction) => {
    const result = reduceAnnotationOverlay(modelRef.current, action);
    modelRef.current = result.model;
    setModel(result.model);
    if (result.events.length === 0) return;
    sendChainRef.current = sendChainRef.current
      .catch(() => {})
      .then(async () => {
        for (const event of result.events) {
          const response = await window.markupr.captureOverlay.sendAnnotation(event);
          if (!response.success) throw new Error(response.error || 'Annotation event was rejected.');
        }
      })
      .catch((error) => console.warn('[LiveAnnotationOverlay] Annotation send failed:', error));
  }, []);

  const pointFromEvent = (event: React.PointerEvent) => normalizeOverlayPoint(
    event.clientX,
    event.clientY,
    window.innerWidth,
    window.innerHeight,
  );

  const leaveDrawMode = useCallback(() => {
    void window.markupr.capture.setAnnotationMode('interact');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modelRef.current.mode === 'draw') leaveDrawMode();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: 'undo' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, leaveDrawMode]);

  return (
    <main
      aria-label="Live recording annotation layer"
      onPointerDown={(event) => {
        if (model.mode !== 'draw' || (event.target as HTMLElement).closest('[data-annotation-control]')) return;
        const point = pointFromEvent(event);
        if (!point || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch({ type: 'pointer-down', strokeId: nextStrokeId(), point });
      }}
      onPointerMove={(event) => {
        if (model.mode !== 'draw' || !modelRef.current.activeStrokeId) return;
        const point = pointFromEvent(event);
        if (point) dispatch({ type: 'pointer-move', point });
      }}
      onPointerUp={(event) => {
        if (model.mode !== 'draw') return;
        const point = pointFromEvent(event);
        if (point) dispatch({ type: 'pointer-up', point });
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => dispatch({ type: 'pointer-cancel' })}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: 'transparent',
        cursor: model.mode === 'draw' ? 'none' : 'default',
        userSelect: 'none',
        touchAction: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      {model.mode === 'draw' && (
        <section
          data-annotation-control
          aria-label="Annotation tools"
          style={{
            position: 'fixed',
            left: '50%',
            top: 14,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 7,
            border: '1px solid rgba(255,255,255,.22)',
            borderRadius: 14,
            background: 'rgba(17,23,34,.94)',
            boxShadow: '0 12px 34px rgba(0,0,0,.38)',
            color: '#fff',
            cursor: 'default',
          }}
        >
          {TOOLS.map(({ tool, label }) => (
            <button
              key={tool}
              type="button"
              aria-pressed={model.tool === tool}
              onClick={() => dispatch({ type: 'set-tool', tool })}
              style={{
                padding: '7px 9px',
                borderRadius: 8,
                border: model.tool === tool ? '1px solid #69b4ff' : '1px solid rgba(255,255,255,.14)',
                background: model.tool === tool ? '#0a84ff' : 'rgba(255,255,255,.07)',
                color: '#fff',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <span aria-hidden="true" style={{ width: 1, height: 22, background: 'rgba(255,255,255,.18)' }} />
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use ${color}`}
              aria-pressed={model.color === color}
              onClick={() => dispatch({ type: 'set-color', color })}
              style={{
                width: 24,
                height: 24,
                padding: 0,
                borderRadius: '50%',
                border: model.color === color ? '3px solid #fff' : '2px solid rgba(255,255,255,.42)',
                background: color,
                cursor: 'pointer',
              }}
            />
          ))}
          <button type="button" onClick={() => dispatch({ type: 'undo' })} style={secondaryButtonStyle}>Undo</button>
          <button type="button" onClick={() => dispatch({ type: 'clear' })} style={secondaryButtonStyle}>Clear</button>
          <button type="button" onClick={leaveDrawMode} style={doneButtonStyle}>Done · Esc</button>
        </section>
      )}
    </main>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '7px 9px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.07)',
  color: '#fff',
  cursor: 'pointer',
};

const doneButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  background: '#fff',
  color: '#111827',
  fontWeight: 700,
};

export default LiveAnnotationOverlay;
