import React, { useEffect, useState } from 'react';
import type { CaptureOverlayState } from '../../shared/types';
import { SelectionOverlay } from './SelectionOverlay';
import { LiveAnnotationOverlay } from './LiveAnnotationOverlay';

export function CaptureOverlayApp(): React.ReactElement {
  const [state, setState] = useState<CaptureOverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    window.markupr.captureOverlay.getState()
      .then((nextState) => {
        if (!mounted) return;
        if (!nextState) setError('This capture overlay is no longer active.');
        setState(nextState);
      })
      .catch((reason) => {
        if (mounted) setError(reason instanceof Error ? reason.message : 'Unable to load capture controls.');
      });
    const unsubscribe = window.markupr.captureOverlay.onStateChange((nextState) => {
      if (mounted) setState(nextState);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (state?.kind === 'selection') return <SelectionOverlay overlayState={state} />;
  if (state?.kind === 'annotation') return <LiveAnnotationOverlay overlayState={state} />;

  return (
    <main style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(5,8,14,.48)', color: '#fff', fontFamily: '-apple-system, sans-serif' }}>
      <p role={error ? 'alert' : 'status'}>{error || 'Preparing capture choices…'}</p>
    </main>
  );
}

export default CaptureOverlayApp;
