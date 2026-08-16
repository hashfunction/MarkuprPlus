/**
 * markuprx - Renderer Entry Point
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWrapper from './AppWrapper';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { initAudioCapture, destroyAudioCapture } from './audio/AudioCaptureRenderer';
import CaptureOverlayApp from './overlays/CaptureOverlayApp';

// Import global styles (includes CSS reset and theme utilities)
import './styles/globals.css';
// Import premium animation styles
import './styles/animations.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const isCaptureOverlay = new URLSearchParams(window.location.search).has('overlay');

// Overlay windows share this renderer bundle but must not initialize microphone
// capture or the primary app contexts.
if (!isCaptureOverlay) {
  initAudioCapture();
  window.addEventListener('beforeunload', () => {
    destroyAudioCapture();
  });
}

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler]', event.error);
  // Could report to main process here
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // Could report to main process here
});

const root = createRoot(container);
root.render(
  <React.StrictMode>
    {isCaptureOverlay ? (
      <ErrorBoundary>
        <CaptureOverlayApp />
      </ErrorBoundary>
    ) : (
      <ThemeProvider defaultMode="light" defaultAccentColor="blue">
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('[App ErrorBoundary]', error, errorInfo);
          }}
        >
          <AppWrapper />
        </ErrorBoundary>
      </ThemeProvider>
    )}
  </React.StrictMode>
);
