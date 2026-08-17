/**
 * ExportDialog - Premium Export Experience for markuprx
 *
 * A beautiful modal dialog for selecting export format and options.
 *
 * Features:
 * - Format cards with descriptions and icons
 * - Live preview panel (Markdown/HTML/JSON)
 * - Theme toggle for HTML/PDF
 * - Include images option
 * - Custom filename input
 * - Export progress indicator
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  ReviewExportFormat as ExportFormat,
  ReviewExportOptions as ExportOptions,
  ReviewExportResult,
  ReviewSession as Session,
} from '../../shared/types';
import {
  isTopmostContainedDialog,
  useContainedDialogFocus,
} from '../hooks/useContainedDialogFocus';
import { getContrastColor, useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

interface ExportDialogProps {
  session: Session | null;
  isOpen: boolean;
  isExportBusy: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<ReviewExportResult>;
  defaultProjectName?: string;
}

interface FormatCardData {
  format: ExportFormat;
  name: string;
  description: string;
  icon: React.ReactNode;
  extension: string;
  features: string[];
}

// ============================================================================
// Icons
// ============================================================================

const MarkdownIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="15" x2="15" y2="15" />
    <line x1="9" y1="11" x2="15" y2="11" />
  </svg>
);

const PdfIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M9 15v-2a1 1 0 011-1h1a1 1 0 011 1v0a1 1 0 01-1 1h-1" />
    <path d="M14 15v-4h1.5a1.5 1.5 0 010 3H14" />
  </svg>
);

const HtmlIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" />
  </svg>
);

const JsonIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 3H7a2 2 0 00-2 2v5a2 2 0 01-2 2 2 2 0 012 2v5a2 2 0 002 2h1" />
    <path d="M16 21h1a2 2 0 002-2v-5a2 2 0 012-2 2 2 0 01-2-2V5a2 2 0 00-2-2h-1" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

// ============================================================================
// Format Data
// ============================================================================

const FORMAT_DATA: FormatCardData[] = [
  {
    format: 'markdown',
    name: 'Markdown',
    description: 'AI-ready format for Claude, ChatGPT, and other assistants',
    icon: <MarkdownIcon />,
    extension: '.md',
    features: ['Structured headings', 'Image references', 'Summary table'],
  },
  {
    format: 'pdf',
    name: 'PDF',
    description: 'Beautiful document for sharing and printing',
    icon: <PdfIcon />,
    extension: '.pdf',
    features: ['Embedded images', 'Print-ready', 'Professional layout'],
  },
  {
    format: 'html',
    name: 'HTML',
    description: 'Standalone web page with no dependencies',
    icon: <HtmlIcon />,
    extension: '.html',
    features: ['Self-contained', 'Dark/Light themes', 'Mobile responsive'],
  },
  {
    format: 'json',
    name: 'JSON',
    description: 'Machine-readable for integrations and APIs',
    icon: <JsonIcon />,
    extension: '.json',
    features: ['Structured data', 'API-friendly', 'Full metadata'],
  },
];

// ============================================================================
// Sub-Components
// ============================================================================

interface FormatCardProps {
  data: FormatCardData;
  isSelected: boolean;
  onSelect: () => void;
}

const FormatCard: React.FC<FormatCardProps> = ({ data, isSelected, onSelect }) => {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.formatCard,
        borderColor: isSelected ? colors.accent.default : colors.border.default,
        backgroundColor: isSelected ? colors.accent.subtle : colors.bg.tertiary,
        boxShadow: isSelected ? `0 0 0 2px ${colors.accent.default}4d` : 'none',
      }}
    >
      <div style={styles.formatIcon}>{data.icon}</div>
      <div style={styles.formatInfo}>
        <div style={styles.formatHeader}>
          <span style={styles.formatName}>{data.name}</span>
          <span style={styles.formatExtension}>{data.extension}</span>
        </div>
        <p style={styles.formatDescription}>{data.description}</p>
        <div style={styles.formatFeatures}>
          {data.features.map((feature) => (
            <span key={feature} style={styles.featureTag}>
              {feature}
            </span>
          ))}
        </div>
      </div>
      {isSelected && (
        <div
          style={{
            ...styles.selectedBadge,
            color: getContrastColor(colors.accent.default),
          }}
        >
          <CheckIcon />
        </div>
      )}
    </button>
  );
};

interface PreviewPanelProps {
  session: Session | null;
  format: ExportFormat;
  projectName: string;
  includeImages: boolean;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  session,
  format,
  projectName,
  includeImages,
}) => {
  const preview = useMemo(() => {
    if (!session) {
      return 'Complete a feedback session to preview an export.';
    }
    const items = session.feedbackItems.slice(0, 3); // Show first 3 items

    switch (format) {
      case 'markdown': {
        let md = `# ${projectName} Feedback Report\n\n`;
        md += `## Feedback Items\n\n`;
        items.forEach((item, i) => {
          md += `### FB-${(i + 1).toString().padStart(3, '0')}: ${item.transcription.slice(0, 40)}...\n`;
          md += `**Type:** ${item.category || 'General'}\n\n`;
          md += `> ${item.transcription.slice(0, 100)}...\n\n`;
        });
        if (session.feedbackItems.length > 3) {
          md += `\n*...and ${session.feedbackItems.length - 3} more items*`;
        }
        return md;
      }

      case 'html':
        return `<!DOCTYPE html>
<html>
<head>
  <title>${projectName} - Feedback</title>
</head>
<body>
  <h1>${projectName} Feedback Report</h1>
  <p>${session.feedbackItems.length} items</p>
  <!-- Full content in exported file -->
</body>
</html>`;

      case 'json':
        return JSON.stringify(
          {
            version: '1.0',
            session: {
              id: session.id,
              items: items.map((item, i) => ({
                id: `FB-${(i + 1).toString().padStart(3, '0')}`,
                transcription: item.transcription.slice(0, 50) + '...',
                category: item.category,
              })),
            },
            '...': session.feedbackItems.length > 3 ? `${session.feedbackItems.length - 3} more items` : undefined,
          },
          null,
          2
        );

      case 'pdf':
        return `[PDF Preview]

${projectName} Feedback Report
${'='.repeat(40)}

This will generate a beautifully formatted
PDF document with:

- ${includeImages ? 'Embedded screenshots' : 'Screenshots excluded (text-only export)'}
- Professional typography
- Print-ready layout
- ${session.feedbackItems.length} feedback items

Export to see the full PDF.`;

      default:
        return '';
    }
  }, [session, format, projectName, includeImages]);

  return (
    <div style={styles.previewPanel}>
      <div style={styles.previewHeader}>
        <span style={styles.previewTitle}>Preview</span>
        <span style={styles.previewFormat}>{format.toUpperCase()}</span>
      </div>
      <pre
        style={styles.previewContent}
        tabIndex={0}
        aria-label={`${format.toUpperCase()} export preview`}
      >
        {preview}
      </pre>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const ExportDialog: React.FC<ExportDialogProps> = ({
  session,
  isOpen,
  isExportBusy,
  onClose,
  onExport,
  defaultProjectName,
}) => {
  const { colors } = useTheme();
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [projectName, setProjectName] = useState(
    defaultProjectName || session?.metadata?.sourceName || 'Feedback Report'
  );
  const [includeImages, setIncludeImages] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isExporting, setIsExporting] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportInFlightRef = useRef(false);
  const successCloseTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const operationGenerationRef = useRef(0);
  const dialogRef = useContainedDialogFocus<HTMLDivElement>(isOpen);

  const clearSuccessCloseTimer = useCallback(() => {
    if (successCloseTimerRef.current !== null) {
      window.clearTimeout(successCloseTimerRef.current);
      successCloseTimerRef.current = null;
    }
  }, []);

  const requestClose = useCallback(() => {
    if (exportInFlightRef.current || isExportBusy) return;
    clearSuccessCloseTimer();
    onClose();
  }, [clearSuccessCloseTimer, isExportBusy, onClose]);

  // Reset state for this mounted instance and invalidate all async work before
  // teardown. A resolved promise from an older dialog must never close a newer
  // instance that happens to share the same parent callback.
  useEffect(() => {
    if (isOpen) {
      mountedRef.current = true;
      operationGenerationRef.current += 1;
      setExportPath(null);
      setExportError(null);
      setIsExporting(false);
      exportInFlightRef.current = false;
    }
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      exportInFlightRef.current = false;
      clearSuccessCloseTimer();
    };
  }, [clearSuccessCloseTimer, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape'
        && isOpen
        && dialogRef.current
        && isTopmostContainedDialog(dialogRef.current)
      ) {
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose, dialogRef]);

  const handleExport = useCallback(async () => {
    if (!session || isExportBusy || exportInFlightRef.current) return;
    const operationGeneration = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationGeneration;
    exportInFlightRef.current = true;
    clearSuccessCloseTimer();
    setExportPath(null);
    setExportError(null);
    setIsExporting(true);
    try {
      const result = await onExport({
        format,
        projectName,
        includeImages,
        theme,
      });
      if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      if (!result.success) {
        setExportError(
          result.status === 'cancelled'
            ? 'Export was cancelled.'
            : result.error || 'Unable to export the feedback session.',
        );
        return;
      }
      setExportPath(result.path);
      successCloseTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
        successCloseTimerRef.current = null;
        onClose();
      }, 2200);
    } catch (error) {
      if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      setExportError(error instanceof Error ? error.message : 'Unable to export the feedback session.');
    } finally {
      if (operationGenerationRef.current === operationGeneration) {
        exportInFlightRef.current = false;
        if (mountedRef.current) setIsExporting(false);
      }
    }
  }, [clearSuccessCloseTimer, format, projectName, includeImages, isExportBusy, theme, onExport, onClose, session]);

  if (!isOpen) return null;

  const selectedFormat = FORMAT_DATA.find((f) => f.format === format)!;
  const showThemeOption = format === 'html' || format === 'pdf';
  const showImagesOption = format !== 'json';
  const isBusy = isExporting || isExportBusy;

  return (
    <div className="ff-contained-dialog-layer" style={styles.overlay} onClick={requestClose}>
      {/* dialogEnter, spin, successPop keyframes provided by animations.css */}

      <div
        ref={dialogRef}
        className="ff-contained-dialog"
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="markuprx-export-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 id="markuprx-export-title" style={styles.title}>Export Feedback</h2>
          <button
            type="button"
            aria-label="Close export dialog"
            onClick={requestClose}
            style={styles.closeButton}
            disabled={isBusy}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="ff-contained-dialog__body" style={styles.content}>
          {!session && (
            <div role="alert" style={styles.availabilityMessage}>
              Complete a feedback session before exporting. Your finished report will be available here.
            </div>
          )}
          {exportError && (
            <div role="alert" style={styles.errorMessage}>
              {exportError}
            </div>
          )}
          {isExportBusy && !isExporting && !exportPath && !exportError && (
            <div role="status" style={styles.busyMessage}>
              A previous export is still finishing. You can export again when it completes.
            </div>
          )}
          {exportPath && (
            <div role="status" style={styles.successMessage}>
              <span>Exported to</span>
              <code style={styles.resultPath}>{exportPath}</code>
            </div>
          )}
          {/* Left: Format Selection */}
          <div style={styles.leftPane}>
            <div style={styles.sectionTitle}>Choose Format</div>
            <div style={styles.formatGrid}>
              {FORMAT_DATA.map((data) => (
                <FormatCard
                  key={data.format}
                  data={data}
                  isSelected={format === data.format}
                  onSelect={() => setFormat(data.format)}
                />
              ))}
            </div>

            {/* Options */}
            <div style={styles.optionsSection}>
              <div style={styles.sectionTitle}>Options</div>

              {/* Project Name */}
              <div style={styles.optionRow}>
                <label htmlFor="markuprx-export-project-name" style={styles.optionLabel}>
                  Project Name
                </label>
                <input
                  id="markuprx-export-project-name"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={styles.textInput}
                  placeholder="Enter project name..."
                />
              </div>

              {/* Include Images */}
              {showImagesOption && (
                <div style={styles.optionRow}>
                  <label style={styles.optionLabel}>Include Images</label>
                  <button
                    type="button"
                    aria-label="Include images"
                    aria-pressed={includeImages}
                    onClick={() => setIncludeImages(!includeImages)}
                    style={{
                      ...styles.toggleButton,
                      backgroundColor: includeImages
                        ? `${colors.accent.default}cc`
                        : 'rgba(51, 65, 85, 0.5)',
                    }}
                  >
                    <div
                      style={{
                        ...styles.toggleKnob,
                        transform: includeImages ? 'translateX(16px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>
              )}

              {/* Theme Toggle */}
              {showThemeOption && (
                <div style={styles.optionRow}>
                  <label style={styles.optionLabel}>Theme</label>
                  <div style={styles.themeToggle}>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      style={{
                        ...styles.themeButton,
                        backgroundColor: theme === 'dark' ? `${colors.accent.default}cc` : 'transparent',
                        color: theme === 'dark' ? colors.text.inverse : colors.text.secondary,
                      }}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      style={{
                        ...styles.themeButton,
                        backgroundColor: theme === 'light' ? `${colors.accent.default}cc` : 'transparent',
                        color: theme === 'light' ? colors.text.inverse : colors.text.secondary,
                      }}
                    >
                      Light
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Preview */}
          <div style={styles.rightPane}>
            <PreviewPanel
              session={session}
              format={format}
              projectName={projectName}
              includeImages={includeImages}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="ff-contained-dialog__actions" style={styles.footer}>
          <div style={styles.footerInfo}>
            <span style={styles.footerItemCount}>
              {session?.feedbackItems.length ?? 0} items
            </span>
            <span style={styles.footerDot}>*</span>
            <span style={styles.footerFormat}>
              {selectedFormat.name} ({selectedFormat.extension})
            </span>
          </div>

          <div style={styles.footerActions}>
            <button type="button" onClick={requestClose} style={styles.cancelButton} disabled={isBusy}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              style={{
                ...styles.exportButton,
                opacity: isBusy || !session ? 0.7 : 1,
                color: getContrastColor(colors.accent.default),
              }}
              disabled={isBusy || !session}
            >
              {isExporting ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex' }}>
                    <SpinnerIcon />
                  </span>
                  <span>Exporting...</span>
                </>
              ) : isExportBusy ? (
                <span>Export in progress...</span>
              ) : exportError ? (
                <span>Retry Export as {selectedFormat.name}</span>
              ) : exportPath ? (
                <>
                  <span style={{ animation: 'successPop 0.3s ease-out' }}>
                    <CheckIcon />
                  </span>
                  <span>Exported!</span>
                </>
              ) : (
                <>
                  <span>Export as {selectedFormat.name}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {},

  dialog: {
    width: '100%',
    maxWidth: 436,
    maxHeight: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: 'var(--bg-elevated)',
    animation: 'dialogEnter 0.2s ease-out',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    minWidth: 0,
    borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
  },

  title: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Content
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
  },

  availabilityMessage: {
    margin: '16px 16px 0',
    padding: 12,
    border: '1px solid var(--status-warning)',
    borderRadius: 10,
    backgroundColor: 'var(--status-warning-subtle)',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },

  errorMessage: {
    margin: '16px 16px 0',
    padding: 12,
    border: '1px solid var(--status-error)',
    borderRadius: 10,
    backgroundColor: 'var(--status-error-subtle)',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },

  busyMessage: {
    margin: '16px 16px 0',
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    backgroundColor: 'var(--surface-inset)',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },

  successMessage: {
    display: 'grid',
    gap: 6,
    margin: '16px 16px 0',
    padding: 12,
    border: '1px solid var(--status-success)',
    borderRadius: 10,
    backgroundColor: 'var(--status-success-subtle)',
    color: 'var(--text-primary)',
    fontSize: 13,
  },

  resultPath: {
    minWidth: 0,
    color: 'var(--text-secondary)',
    fontSize: 11,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },

  leftPane: {
    width: '100%',
    minWidth: 0,
    padding: 16,
  },

  rightPane: {
    width: '100%',
    minWidth: 0,
    minHeight: 180,
    maxHeight: 240,
    padding: 16,
    backgroundColor: 'var(--surface-inset)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 12,
  },

  // Format Grid
  formatGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 12,
    marginBottom: 24,
  },

  formatCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    border: '1px solid',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
    position: 'relative',
  },

  formatIcon: {
    flexShrink: 0,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
    color: 'var(--text-link)',
  },

  formatInfo: {
    flex: 1,
    minWidth: 0,
  },

  formatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },

  formatName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },

  formatExtension: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontFamily: 'ui-monospace, monospace',
  },

  formatDescription: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.4,
    marginBottom: 8,
  },

  formatFeatures: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },

  featureTag: {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--surface-inset)',
    padding: '2px 6px',
    borderRadius: 4,
  },

  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--accent-default)',
    borderRadius: '50%',
    color: 'var(--text-inverse)',
  },

  // Options
  optionsSection: {
    marginTop: 8,
  },

  optionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
  },

  optionLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },

  textInput: {
    flex: '1 1 210px',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },

  toggleButton: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s ease',
    padding: 2,
  },

  toggleKnob: {
    width: 20,
    height: 20,
    backgroundColor: 'var(--text-inverse)',
    borderRadius: '50%',
    transition: 'transform 0.2s ease',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
  },

  themeToggle: {
    display: 'flex',
    backgroundColor: 'var(--surface-inset)',
    borderRadius: 8,
    padding: 2,
  },

  themeButton: {
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Preview
  previewPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: 12,
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-default)',
  },

  previewTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  previewFormat: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-primary)',
    backgroundColor: 'var(--accent-subtle)',
    padding: '2px 8px',
    borderRadius: 4,
  },

  previewContent: {
    flex: 1,
    padding: 14,
    margin: 0,
    fontSize: 11,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    overflowX: 'hidden',
    wordBreak: 'break-word',
  },

  // Footer
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--surface-glass)',
  },

  footerInfo: {
    display: 'flex',
    flex: '1 1 150px',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },

  footerItemCount: {
    fontWeight: 500,
  },

  footerDot: {
    opacity: 0.5,
  },

  footerFormat: {
    color: 'var(--text-secondary)',
  },

  footerActions: {
    display: 'flex',
    flex: '1 1 auto',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },

  cancelButton: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(51, 65, 85, 0.5)',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  exportButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    backgroundColor: 'var(--accent-default)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text-inverse)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};

export { ExportDialog };
export type { ExportDialogProps, ExportOptions, ExportFormat };
