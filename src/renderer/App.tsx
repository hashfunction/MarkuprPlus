import React, { useCallback, useEffect } from 'react';
import type { SessionState } from '../shared/types';
import {
  CrashRecoveryDialog,
  Onboarding,
  SettingsPanel,
  CountdownTimer,
  CompactAudioIndicator,
  DonateButton,
  KeyboardShortcuts,
  ExportDialog,
  SessionReview,
  RecordingOverlay,
  ProcessingOverlay,
} from './components';
import { SessionHistory } from './components/SessionHistory';
import { ToggleRecordingHint, ManualScreenshotHint, PauseResumeHint } from './components/HotkeyHint';
import StatusIndicator from './components/StatusIndicator';
import {
  useRecording,
  useProcessing,
  useUI,
  PROCESSING_BASELINE_PERCENT,
  PROCESSING_DOT_FRAMES,
  formatProcessingStep,
} from './contexts';
import './styles/app-shell.css';

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function formatCaptureTrigger(trigger?: 'pause' | 'manual' | 'voice-command' | 'annotation'): string {
  switch (trigger) {
    case 'annotation':
      return 'Annotation Frame Marker';
    case 'manual':
      return 'Manual Shot Marker';
    case 'voice-command':
      return 'Voice Cue Marker';
    default:
      return 'AI Frame Marker';
  }
}

function mapPopoverState(state: SessionState): 'idle' | 'recording' | 'processing' | 'complete' | 'error' {
  if (state === 'recording' || state === 'starting') return 'recording';
  if (state === 'stopping' || state === 'processing') return 'processing';
  if (state === 'complete') return 'complete';
  if (state === 'error') return 'error';
  return 'idle';
}

// ============================================================================
// App Component
// ============================================================================

const App: React.FC = () => {
  const recording = useRecording();
  const processing = useProcessing();
  const ui = useUI();

  // ---------------------------------------------------------------------------
  // HUD mode body class
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const bodyClass = 'markuprx-hud-mode';
    const htmlClass = 'markuprx-hud-mode';
    document.documentElement.classList.toggle(htmlClass, ui.isHudMode);
    document.body.classList.toggle(bodyClass, ui.isHudMode);
    return () => {
      document.documentElement.classList.remove(htmlClass);
      document.body.classList.remove(bodyClass);
    };
  }, [ui.isHudMode]);

  // ---------------------------------------------------------------------------
  // Primary action (orchestrates countdown + start/stop)
  // ---------------------------------------------------------------------------
  const handlePrimaryAction = useCallback(async () => {
    if (ui.primaryActionDisabled) return;

    if (recording.state === 'idle' && ui.countdownDuration > 0) {
      ui.setShowCountdown(true);
      return;
    }

    if (recording.state === 'recording') {
      await recording.stopSession();
    } else {
      await recording.startSession();
    }
  }, [ui.primaryActionDisabled, ui.countdownDuration, ui.setShowCountdown, recording.state, recording.stopSession, recording.startSession]);

  const handleCountdownComplete = useCallback(async () => {
    ui.setShowCountdown(false);
    await recording.startSession();
  }, [ui.setShowCountdown, recording.startSession]);

  const handleCountdownSkip = useCallback(() => {
    ui.setShowCountdown(false);
  }, [ui.setShowCountdown]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className={`ff-shell ff-shell--${recording.state}${ui.isHudMode ? ' ff-shell--hud' : ''}`}>
      {/* === Global overlays === */}
      {recording.incompleteSession && !recording.isCheckingRecovery && (
        <CrashRecoveryDialog
          session={recording.incompleteSession}
          onRecover={recording.recoverSession}
          onDiscard={recording.discardSession}
        />
      )}

      {ui.showOnboarding && (
        <Onboarding
          onComplete={ui.handleOnboardingComplete}
          onSkip={ui.handleOnboardingSkip}
        />
      )}

      {ui.showCountdown && ui.countdownDuration > 0 && (
        <CountdownTimer
          duration={ui.countdownDuration as 3 | 5}
          onComplete={handleCountdownComplete}
          onSkip={handleCountdownSkip}
        />
      )}

      {ui.showExportDialog && (
        <ExportDialog
          session={{ id: '', startTime: Date.now(), feedbackItems: [] }}
          isOpen={ui.showExportDialog}
          onClose={() => ui.setShowExportDialog(false)}
          onExport={ui.handleExport}
        />
      )}

      {/* === Main Card === */}
      <main
        className={
          'ff-shell__card' +
          (ui.isHudMode ? ' ff-shell__card--hud' : '') +
          (ui.currentView !== 'main' ? ' ff-shell__card--portrait' : '')
        }
      >
        {ui.currentView === 'settings' && (
          <SettingsPanel isOpen onClose={ui.closeOverlay} />
        )}
        {ui.currentView === 'history' && (
          <SessionHistory
            isOpen
            onClose={ui.closeOverlay}
            onOpenSession={recording.openRecent}
          />
        )}
        {ui.currentView === 'shortcuts' && (
          <KeyboardShortcuts isOpen onClose={ui.closeOverlay} />
        )}

        {ui.currentView === 'main' && (
          <>
        {ui.showRecordingStatus && (
          <RecordingOverlay
            duration={Math.floor(recording.duration / 1000)}
            screenshotCount={recording.screenshotCount}
            onStop={() => { void handlePrimaryAction(); }}
            audioLevel={recording.audioLevel}
            isVoiceActive={recording.isVoiceActive}
            isPaused={recording.isPaused}
            manualShortcut={ui.settings?.hotkeys?.manualScreenshot}
            toggleShortcut={ui.settings?.hotkeys?.toggleRecording}
            pauseShortcut={ui.settings?.hotkeys?.pauseResume}
            annotationActive={recording.annotationActive}
            annotationMode={recording.annotationMode}
            annotationInputMode={recording.annotationInputMode}
            annotationModifierKey={recording.annotationModifierKey}
            pendingMarkedIssue={recording.pendingMarkedIssue}
            markedIssueCount={recording.markedIssueCount}
            onToggleAnnotation={() => { void recording.toggleAnnotation(); }}
          />
        )}

        {ui.showProcessingProgress && ui.isHudMode && (
          <ProcessingOverlay
            percent={processing.processingProgress?.percent ?? PROCESSING_BASELINE_PERCENT}
            step={processing.processingProgress?.step || formatProcessingStep('preparing')}
            onHide={() => { void window.markuprx.window.hide(); }}
          />
        )}

        {!ui.isHudMode && (
          <>
        <header className="ff-shell__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusIndicator
              status={mapPopoverState(recording.state)}
              error={recording.errorMessage}
            />
            <div>
              <p className="ff-shell__eyebrow">MarkuprX</p>
              <h1 className="ff-shell__title">{ui.statusCopy.title}</h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="ff-shell__quiet-btn"
              onClick={() => ui.setCurrentView('settings')}
              type="button"
              aria-label="Open Settings"
              title="Settings"
              style={{ fontSize: 16 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
                <path d="M13.178 9.689a1.2 1.2 0 00.24 1.324l.043.044a1.455 1.455 0 11-2.058 2.058l-.044-.044a1.2 1.2 0 00-1.324-.24 1.2 1.2 0 00-.727 1.098v.122a1.455 1.455 0 01-2.91 0v-.065a1.2 1.2 0 00-.785-1.097 1.2 1.2 0 00-1.324.24l-.044.043a1.455 1.455 0 11-2.058-2.058l.044-.044a1.2 1.2 0 00.24-1.324 1.2 1.2 0 00-1.098-.727h-.122a1.455 1.455 0 010-2.91h.065a1.2 1.2 0 001.097-.785 1.2 1.2 0 00-.24-1.324l-.043-.044A1.455 1.455 0 114.187 1.84l.044.044a1.2 1.2 0 001.324.24h.058a1.2 1.2 0 00.727-1.098V.904a1.455 1.455 0 012.91 0v.065a1.2 1.2 0 00.727 1.097 1.2 1.2 0 001.324-.24l.044-.043a1.455 1.455 0 112.058 2.058l-.044.044a1.2 1.2 0 00-.24 1.324v.058a1.2 1.2 0 001.098.727h.122a1.455 1.455 0 010 2.91h-.065a1.2 1.2 0 00-1.097.727z" />
              </svg>
            </button>
            <button
              className="ff-shell__quiet-btn"
              onClick={() => ui.setCurrentView('history')}
              type="button"
              aria-label="Open Session History"
              title="Session History"
              style={{ fontSize: 16 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M8 1.455A6.545 6.545 0 1014.545 8" />
                <path d="M8 4v4l2.5 2.5" />
              </svg>
            </button>
            <button
              className="ff-shell__quiet-btn"
              onClick={() => window.markuprx.window.hide()}
              type="button"
            >
              Hide
            </button>
          </div>
        </header>

        <p className="ff-shell__subtitle">{ui.statusCopy.detail}</p>

        <section className="ff-shell__controls">
          <button
            className={`ff-shell__primary-btn ${recording.state === 'recording' ? 'is-live' : ''}`}
            type="button"
            onClick={handlePrimaryAction}
            disabled={ui.primaryActionDisabled}
          >
            {recording.state === 'processing' || recording.state === 'stopping' ? 'Processing\u2026' : ui.primaryActionLabel}
          </button>

          <button
            className="ff-shell__secondary-btn"
            type="button"
            onClick={recording.togglePause}
            disabled={ui.pauseActionDisabled}
          >
            {recording.isPaused ? 'Resume Session' : 'Pause Session'} (<PauseResumeHint inline />)
          </button>

          <button
            className="ff-shell__secondary-btn"
            type="button"
            onClick={recording.manualCapture}
            disabled={ui.manualCaptureDisabled}
          >
            Capture Screenshot (<ManualScreenshotHint inline />)
          </button>
        </section>

        <section className="ff-shell__meta">
          <span>{formatDuration(recording.duration)}</span>
          <span>{recording.screenshotCount} shots marked</span>
          <span className={recording.hasTranscriptionCapability ? 'is-ready' : 'is-optional'}>
            {recording.hasTranscriptionCapability ? 'Transcript Ready' : 'Add OpenAI Key'}
          </span>
          {recording.lastCapture && (
            <span title={new Date(recording.lastCapture.timestamp).toLocaleString()}>
              {formatCaptureTrigger(recording.lastCapture.trigger)}
            </span>
          )}
        </section>

        {recording.state === 'idle' && ui.settings && ui.settings.analysisProvider !== 'rules' && (
          <section className="ff-shell__byok-cta" data-ready={ui.analysisProviderViewState.ready}>
            <p className="ff-shell__byok-title">{ui.analysisProviderViewState.title}</p>
            <p className="ff-shell__byok-detail">{ui.analysisProviderViewState.detail}</p>
            {ui.analysisProviderViewState.actionLabel && (
              <button
                type="button"
                className="ff-shell__byok-btn"
                onClick={() => ui.setCurrentView('settings')}
              >
                {ui.analysisProviderViewState.actionLabel}
              </button>
            )}
          </section>
        )}

        {ui.showRecordingStatus && (
          <section className="ff-shell__transcript">
            <p className="ff-shell__transcript-label">Recording Active</p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(16, 22, 32, 0.72)',
                border: '1px solid rgba(145, 160, 186, 0.26)',
              }}
            >
              <span className="ff-shell__transcript-line">
                {recording.isPaused
                  ? 'Session paused'
                  : recording.isVoiceActive
                    ? 'Mic is active'
                    : 'Listening for narration'}
              </span>
              {ui.settings?.showAudioWaveform !== false && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CompactAudioIndicator
                    audioLevel={recording.audioLevel}
                    isVoiceActive={recording.isVoiceActive}
                    accentColor="#0a84ff"
                    inactiveColor="#c7c7cc"
                    barCount={7}
                  />
                  <span
                    style={{
                      minWidth: 44,
                      textAlign: 'right',
                      fontSize: 11,
                      color: '#98a7c0',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Math.round(Math.max(0, Math.min(1, recording.audioLevel)) * 100)}%
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <span className="ff-shell__meta-pill">
                Mark Shot: <ManualScreenshotHint inline />
              </span>
              <span className="ff-shell__meta-pill">
                Stop: <ToggleRecordingHint inline />
              </span>
              <span className="ff-shell__meta-pill">
                Pause: <PauseResumeHint inline />
              </span>
            </div>
            <p className="ff-shell__transcript-placeholder" style={{ marginTop: 8 }}>
              Manual shots are confirmed instantly above. After stop, AI analyzes your transcript + screen frames and assembles an AI-ready report.
            </p>
          </section>
        )}

        {ui.showProcessingProgress && (
          <section className="ff-shell__processing">
            <p className="ff-shell__processing-label">
              Processing your recording
              <span className="ff-shell__processing-dots" aria-hidden="true">
                {PROCESSING_DOT_FRAMES[processing.processingDotFrame] || PROCESSING_DOT_FRAMES[0]}
              </span>
            </p>
            <div className="ff-shell__processing-bar-track">
              <div
                className="ff-shell__processing-bar-fill"
                style={{ width: `${processing.processingProgress?.percent ?? 0}%` }}
              />
            </div>
            <div className="ff-shell__processing-info">
              <span className="ff-shell__processing-percent">
                {processing.processingProgress?.percent ?? 0}%
              </span>
              <span className="ff-shell__processing-step">
                {processing.processingProgress?.step || 'Preparing...'}
              </span>
            </div>
          </section>
        )}

        {recording.state === 'complete' && recording.reviewSession && recording.showReviewEditor && (
          <SessionReview
            session={recording.reviewSession}
            onSave={recording.reviewSave}
            onCopy={recording.copyReportPath}
            onOpenFolder={recording.openReportFolder}
            onClose={recording.reviewClose}
          />
        )}

        {recording.reportPath && (!recording.reviewSession || !recording.showReviewEditor) && (
          <section className="ff-shell__report">
            <p className="ff-shell__report-label">Latest Report Path</p>
            <code className="ff-shell__path">{recording.reportPath}</code>
            <div className="ff-shell__report-actions">
              <button type="button" onClick={recording.copyReportPath}>
                Copy Path
              </button>
              <button type="button" onClick={recording.openReportFolder}>
                Open Folder
              </button>
              {recording.reviewSession && (
                <button type="button" onClick={() => recording.setShowReviewEditor(true)}>
                  Open Review Editor
                </button>
              )}
            </div>
            {recording.recordingPath && (
              <>
                <p className="ff-shell__report-label">Session Recording</p>
                <code className="ff-shell__path">{recording.recordingPath}</code>
                <div className="ff-shell__report-actions">
                  <button type="button" onClick={recording.copyRecordingPath}>
                    Copy Recording Path
                  </button>
                  <button type="button" onClick={recording.openReportFolder}>
                    Open Folder
                  </button>
                </div>
              </>
            )}
            {recording.audioPath && (
              <>
                <p className="ff-shell__report-label">Narration Audio</p>
                <code className="ff-shell__path">{recording.audioPath}</code>
                <div className="ff-shell__report-actions">
                  <button type="button" onClick={recording.copyAudioPath}>
                    Copy Audio Path
                  </button>
                  <button type="button" onClick={recording.openReportFolder}>
                    Open Folder
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {recording.errorMessage && recording.state === 'error' && (
          <section className="ff-shell__error">
            <p>{recording.errorMessage}</p>
          </section>
        )}

        <section className="ff-shell__recent">
          <div className="ff-shell__recent-header">
            <h2>Recent Captures</h2>
            <button type="button" onClick={recording.loadRecentSessions}>
              Refresh
            </button>
          </div>

          {recording.recentSessions.length === 0 ? (
            <p className="ff-shell__empty">No captures yet. Run a session and it will appear here.</p>
          ) : (
            <ul className="ff-shell__recent-list">
              {recording.recentSessions.map((session) => (
                <li key={session.id} className="ff-shell__recent-item">
                  <button
                    className="ff-shell__recent-open"
                    type="button"
                    onClick={() => recording.openRecent(session)}
                  >
                    <span>{session.sourceName || 'Feedback Session'}</span>
                    <span>{formatRelativeTime(session.startTime)}</span>
                  </button>
                  <div className="ff-shell__recent-meta">
                    <span>{session.itemCount} items</span>
                    <span>{session.screenshotCount} shots</span>
                    <button type="button" onClick={() => recording.copyRecentPath(session)}>
                      Copy File Path
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="ff-shell__footer">
          <p>
            Mic activity is monitored live; narration is transcribed after recording completes.
          </p>
          <p>
            Global hotkey: <ToggleRecordingHint inline /> starts or stops the loop.
          </p>
          <DonateButton className="ff-shell__donate" />
        </footer>
          </>
        )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
