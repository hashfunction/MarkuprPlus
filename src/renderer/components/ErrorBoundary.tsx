/**
 * ErrorBoundary - React Error Boundary for markuprx
 *
 * Catches JavaScript errors in child components, logs them,
 * and displays a fallback UI instead of crashing the entire app.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ============================================================================
// ErrorBoundary Component
// ============================================================================

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Log to session error handler if available
    // Error reporting to main process is handled via session.onError subscription
    console.error('[ErrorBoundary] Error boundary caught:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div style={styles.container} role="alert" aria-live="assertive">
          <div style={styles.card}>
            {/* Error icon */}
            <div style={styles.iconContainer}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--status-error)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* Error message */}
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {/* Error details (collapsible in dev) */}
            {this.state.errorInfo && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details</summary>
                <pre style={styles.stackTrace}>
                  {this.state.error?.stack}
                  {'\n\nComponent Stack:'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Action buttons */}
            <div style={styles.buttonContainer}>
              <button
                onClick={this.handleRetry}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Minimal Error Boundary (for smaller components)
// ============================================================================

interface MinimalErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
}

interface MinimalErrorBoundaryState {
  hasError: boolean;
}

export class MinimalErrorBoundary extends Component<
  MinimalErrorBoundaryProps,
  MinimalErrorBoundaryState
> {
  state: MinimalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<MinimalErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[MinimalErrorBoundary] Error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={minimalStyles.container}>
          <span style={minimalStyles.text}>
            {this.props.fallbackMessage || 'Component error'}
          </span>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={minimalStyles.retryButton}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
    height: '100%',
    backgroundColor: 'var(--bg-secondary)',
    padding: '16px',
    overflow: 'auto',
  },
  card: {
    backgroundColor: 'rgba(31, 41, 55, 0.95)',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    textAlign: 'center',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  },
  iconContainer: {
    marginBottom: '16px',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 8px 0',
  },
  message: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  details: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '24px',
    textAlign: 'left',
  },
  summary: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  stackTrace: {
    color: 'var(--status-error)',
    fontSize: '10px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '12px 0 0 0',
    maxHeight: '200px',
    overflow: 'auto',
  },
  buttonContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'center',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    backgroundColor: 'var(--accent-default)',
    color: 'var(--text-inverse)',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'var(--text-secondary)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
};

const minimalStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '4px',
  },
  text: {
    color: 'var(--status-error)',
    fontSize: '12px',
  },
  retryButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: '1px solid var(--status-error)',
    borderRadius: '4px',
    color: 'var(--status-error)',
    fontSize: '11px',
    cursor: 'pointer',
  },
};

// ============================================================================
// Export
// ============================================================================

export default ErrorBoundary;
