/**
 * SessionReview - Premium Feedback Review Experience
 *
 * A document-editor-style interface for reviewing and editing feedback before export.
 *
 * Features:
 * - Thumbnail grid with drag-to-reorder
 * - Inline transcript editing
 * - Delete with undo (5 second toast)
 * - Portrait item flow with an optional Markdown preview
 * - Category/severity tags (clickable to change)
 * - Save/Copy/Open Folder actions
 * - Full keyboard navigation (Up/Down, Delete, Enter)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  ReviewSession as Session,
  ReviewFeedbackItem as FeedbackItem,
  ReviewFeedbackCategory as FeedbackCategory,
  ReviewFeedbackSeverity as FeedbackSeverity,
} from '../../shared/types';
import { getContrastColor, useTheme } from '../hooks/useTheme';
import { PortraitSurface } from './PortraitSurface';

// ============================================================================
// Types
// ============================================================================

interface SessionReviewProps {
  session: Session;
  onSave: (session: Session) => Promise<void> | void;
  onCopy: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
}

interface DeletedItem {
  item: FeedbackItem;
  index: number;
  timeoutId: NodeJS.Timeout;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES: FeedbackCategory[] = ['Bug', 'UX Issue', 'Suggestion', 'Performance', 'Question', 'General'];
const SEVERITIES: FeedbackSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

// Category and severity color maps are now created inside components using useTheme()
// to support dynamic theme switching.

const UNDO_DURATION_MS = 5000;

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * FeedbackItemCard - Draggable, editable feedback item
 */
interface FeedbackItemCardProps {
  item: FeedbackItem;
  index: number;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  dragOverIndex: number | null;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (newText: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onCategoryChange: (category: FeedbackCategory) => void;
  onSeverityChange: (severity: FeedbackSeverity) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onThumbnailClick: (imagePath: string) => void;
}

const FeedbackItemCard: React.FC<FeedbackItemCardProps> = ({
  item,
  index,
  isSelected,
  isEditing,
  isDragging,
  dragOverIndex,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCategoryChange,
  onSeverityChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onThumbnailClick,
}) => {
  const [editText, setEditText] = useState(item.transcription);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeverityDropdown, setShowSeverityDropdown] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { colors } = useTheme();

  const CATEGORY_COLORS = useMemo((): Record<FeedbackCategory, string> => ({
    Bug: colors.status.error,
    'UX Issue': colors.status.warning,
    Suggestion: colors.accent.default,
    Performance: colors.status.success,
    Question: colors.status.info,
    General: colors.text.tertiary,
  }), [colors]);

  const SEVERITY_COLORS = useMemo((): Record<FeedbackSeverity, string> => ({
    Critical: colors.status.error,
    High: colors.status.warning,
    Medium: colors.status.warning,
    Low: colors.status.success,
  }), [colors]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditText(item.transcription);
  }, [item.transcription]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSaveEdit(editText);
    } else if (e.key === 'Escape') {
      onCancelEdit();
      setEditText(item.transcription);
    }
  };

  const category = item.category || 'General';
  const severity = item.severity || 'Medium';
  const isDropTarget = dragOverIndex === index && !isDragging;

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowCategoryDropdown(false);
        setShowSeverityDropdown(false);
      }}
      style={{
        ...styles.card,
        backgroundColor: isSelected ? colors.accent.subtle : colors.surface.inset,
        borderColor: isSelected ? colors.accent.muted : colors.border.subtle,
        transform: isDragging ? 'scale(0.98) rotate(1deg)' : isDropTarget ? 'translateY(4px)' : 'none',
        opacity: isDragging ? 0.6 : 1,
        boxShadow: isDropTarget
          ? `0 -2px 0 0 ${colors.accent.default}, 0 8px 16px -4px rgba(0, 0, 0, 0.3)`
          : isSelected
          ? `0 8px 16px -4px ${colors.accent.subtle}`
          : 'none',
      }}
    >
      {/* Drag Handle */}
      <div style={styles.dragHandle}>
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
          <circle cx="3" cy="4" r="1.5" fill="currentColor" />
          <circle cx="9" cy="4" r="1.5" fill="currentColor" />
          <circle cx="3" cy="10" r="1.5" fill="currentColor" />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <circle cx="3" cy="16" r="1.5" fill="currentColor" />
          <circle cx="9" cy="16" r="1.5" fill="currentColor" />
        </svg>
      </div>

      {/* Content Area */}
      <div style={styles.cardContent}>
        {/* Header Row: ID + Tags */}
        <div style={styles.cardHeader}>
          <span style={styles.itemId}>FB-{(index + 1).toString().padStart(3, '0')}</span>

          {/* Category Tag */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCategoryDropdown(!showCategoryDropdown);
                setShowSeverityDropdown(false);
              }}
              style={{
                ...styles.tag,
                backgroundColor: `${CATEGORY_COLORS[category]}20`,
                color: CATEGORY_COLORS[category],
                borderColor: `${CATEGORY_COLORS[category]}40`,
              }}
            >
              {category}
            </button>
            {showCategoryDropdown && (
              <div style={styles.dropdown}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCategoryChange(cat);
                      setShowCategoryDropdown(false);
                    }}
                    style={{
                      ...styles.dropdownItem,
                      backgroundColor: cat === category ? colors.accent.subtle : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: CATEGORY_COLORS[cat],
                        marginRight: 8,
                      }}
                    />
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Severity Tag */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSeverityDropdown(!showSeverityDropdown);
                setShowCategoryDropdown(false);
              }}
              style={{
                ...styles.tag,
                backgroundColor: `${SEVERITY_COLORS[severity]}20`,
                color: SEVERITY_COLORS[severity],
                borderColor: `${SEVERITY_COLORS[severity]}40`,
              }}
            >
              {severity}
            </button>
            {showSeverityDropdown && (
              <div style={styles.dropdown}>
                {SEVERITIES.map((sev) => (
                  <button
                    key={sev}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeverityChange(sev);
                      setShowSeverityDropdown(false);
                    }}
                    style={{
                      ...styles.dropdownItem,
                      backgroundColor: sev === severity ? colors.accent.subtle : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: SEVERITY_COLORS[sev],
                        marginRight: 8,
                      }}
                    />
                    {sev}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons (on hover) */}
          {isHovered && !isEditing && (
            <div style={styles.cardActions}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit();
                }}
                style={styles.actionButton}
                title="Edit (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                style={{ ...styles.actionButton, color: 'var(--status-error)' }}
                title="Delete (Del)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Transcription */}
        {isEditing ? (
          <textarea
            ref={editInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSaveEdit(editText)}
            style={styles.editTextarea}
            placeholder="Enter feedback text..."
          />
        ) : (
          <p style={styles.transcription}>{item.transcription}</p>
        )}

        {/* Screenshot Thumbnails */}
        {item.screenshots.length > 0 && (
          <div style={styles.thumbnailRow}>
            {item.screenshots.map((screenshot, ssIndex) => (
              <button
                key={screenshot.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onThumbnailClick(screenshot.imagePath);
                }}
                style={styles.thumbnail}
                title="Click to view full size"
              >
                {screenshot.base64 ? (
                  <img
                    src={`data:image/png;base64,${screenshot.base64}`}
                    alt={`Screenshot ${ssIndex + 1}`}
                    style={styles.thumbnailImage}
                  />
                ) : (
                  <div style={styles.thumbnailPlaceholder}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * MarkdownPreview - Live preview of the generated output
 */
interface MarkdownPreviewProps {
  session: Session;
  projectName?: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ session, projectName = 'Project' }) => {
  const markdown = useMemo(() => {
    const items = session.feedbackItems;
    const duration = session.endTime
      ? formatDuration(session.endTime - session.startTime)
      : 'In Progress';
    const timestamp = new Date(session.endTime || Date.now()).toLocaleString();

    let content = `# ${projectName} Feedback Report\n`;
    content += `> Generated by MarkuprX on ${timestamp}\n`;
    content += `> Duration: ${duration} | Items: ${items.length}\n\n`;
    content += `---\n\n`;
    content += `## Feedback Items\n\n`;

    items.forEach((item, index) => {
      const id = `FB-${(index + 1).toString().padStart(3, '0')}`;
      const category = item.category || 'General';
      const severity = item.severity || 'Medium';

      content += `### ${id}: ${item.transcription.slice(0, 50)}${item.transcription.length > 50 ? '...' : ''}\n`;
      content += `**Type:** ${category} | **Severity:** ${severity}\n\n`;
      content += `> ${item.transcription}\n\n`;

      if (item.screenshots.length > 0) {
        content += `*${item.screenshots.length} screenshot(s) attached*\n\n`;
      }

      content += `---\n\n`;
    });

    return content;
  }, [session, projectName]);

  return (
    <div style={styles.previewContainer}>
      <div style={styles.previewHeader}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span style={styles.previewTitle}>Markdown Preview</span>
      </div>
      <pre
        style={styles.previewContent}
        tabIndex={0}
        aria-label="Markdown report preview"
      >
        {markdown}
      </pre>
    </div>
  );
};

/**
 * DeleteUndoToast - Toast notification with undo action
 */
interface DeleteUndoToastProps {
  itemId: string;
  onUndo: () => void;
  progress: number;
}

const DeleteUndoToast: React.FC<DeleteUndoToastProps> = ({ itemId, onUndo, progress }) => {
  return (
    <div style={styles.toast}>
      <div style={styles.toastContent}>
        <span style={styles.toastText}>Deleted {itemId}</span>
        <button onClick={onUndo} style={styles.undoButton}>
          Undo
        </button>
      </div>
      <div style={styles.toastProgress}>
        <div
          style={{
            ...styles.toastProgressBar,
            width: `${progress}%`,
          }}
        />
      </div>
    </div>
  );
};

/**
 * ImageLightbox - Full-size image viewer
 */
interface ImageLightboxProps {
  imagePath: string;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imagePath, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="ff-contained-lightbox ff-dialog-enter"
      style={styles.lightboxOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot preview"
      tabIndex={-1}
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        style={styles.lightboxClose}
        aria-label="Close screenshot preview"
        onClick={onClose}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <img
        src={imagePath}
        alt="Screenshot"
        style={styles.lightboxImage}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Main Component
// ============================================================================

const SessionReview: React.FC<SessionReviewProps> = ({
  session,
  onSave,
  onCopy,
  onOpenFolder,
  onClose,
}) => {
  const { colors } = useTheme();
  // State
  const [items, setItems] = useState<FeedbackItem[]>(session.feedbackItems);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [undoProgress, setUndoProgress] = useState(100);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync items back to session
  const currentSession = useMemo(
    (): Session => ({
      ...session,
      feedbackItems: items,
    }),
    [session, items]
  );

  // Undo progress timer
  useEffect(() => {
    if (deletedItems.length === 0) {
      setUndoProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setUndoProgress((prev) => Math.max(0, prev - 2));
    }, UNDO_DURATION_MS / 50);

    return () => clearInterval(interval);
  }, [deletedItems]);

  // Handlers
  const handleDelete = useCallback(
    (index: number) => {
      const itemToDelete = items[index];
      const timeoutId = setTimeout(() => {
        setDeletedItems((prev) => prev.filter((d) => d.item.id !== itemToDelete.id));
      }, UNDO_DURATION_MS);

      setDeletedItems((prev) => [...prev, { item: itemToDelete, index, timeoutId }]);
      setItems((prev) => prev.filter((_, i) => i !== index));
      setHasChanges(true);
      setUndoProgress(100);

      if (selectedIndex === index) {
        setSelectedIndex(null);
      } else if (selectedIndex !== null && selectedIndex > index) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    [items, selectedIndex]
  );

  // Handle keyboard navigation (must be after handleDelete is defined)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if editing
      if (editingIndex !== null) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev === null ? items.length - 1 : Math.max(0, prev - 1)
          );
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev === null ? 0 : Math.min(items.length - 1, prev + 1)
          );
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedIndex !== null && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleDelete(selectedIndex);
          }
          break;
        case 'Enter':
          if (selectedIndex !== null) {
            e.preventDefault();
            setEditingIndex(selectedIndex);
          }
          break;
        case 'Escape':
          setSelectedIndex(null);
          setEditingIndex(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, selectedIndex, editingIndex, handleDelete]);

  const handleUndo = useCallback(
    (deletedItem: DeletedItem) => {
      clearTimeout(deletedItem.timeoutId);
      setDeletedItems((prev) => prev.filter((d) => d.item.id !== deletedItem.item.id));
      setItems((prev) => {
        const newItems = [...prev];
        newItems.splice(deletedItem.index, 0, deletedItem.item);
        return newItems;
      });
    },
    []
  );

  const handleSaveEdit = useCallback(
    (index: number, newText: string) => {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, transcription: newText } : item
        )
      );
      setEditingIndex(null);
      setHasChanges(true);
    },
    []
  );

  const handleCategoryChange = useCallback(
    (index: number, category: FeedbackCategory) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, category } : item))
      );
      setHasChanges(true);
    },
    []
  );

  const handleSeverityChange = useCallback(
    (index: number, severity: FeedbackSeverity) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, severity } : item))
      );
      setHasChanges(true);
    },
    []
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setItems((prev) => {
        const newItems = [...prev];
        const [draggedItem] = newItems.splice(dragIndex, 1);
        newItems.splice(dragOverIndex, 0, draggedItem);
        return newItems;
      });
      setHasChanges(true);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex]);

  const handleSave = useCallback(async () => {
    try {
      await onSave(currentSession);
      setHasChanges(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save review.');
    }
  }, [currentSession, onSave]);

  return (
    <div ref={containerRef} className="ff-review-shell">
      <PortraitSurface
        title="Review Editor"
        titleId="markuprx-review-title"
        backLabel="Back to report"
        onBack={onClose}
        subtitle={hasChanges ? 'Unsaved changes' : `${items.length} feedback items`}
        className="ff-review-surface"
        headerActions={(
          <button
            type="button"
            className="ff-review-preview-toggle"
            aria-expanded={showPreview}
            aria-controls="markuprx-review-preview"
            onClick={() => setShowPreview((value) => !value)}
          >
            Preview
          </button>
        )}
        contentLabel="Feedback items"
        footer={(
          <div className="ff-review-actions">
            <button type="button" onClick={onOpenFolder}>Open Folder</button>
            <button type="button" onClick={onCopy}>Copy</button>
            <button
              type="button"
              style={{
                backgroundColor: colors.accent.default,
                borderColor: colors.accent.default,
                color: getContrastColor(colors.accent.default),
              }}
              onClick={() => { void handleSave(); }}
            >
              Save
            </button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        )}
      >
        <div className="ff-review-items">
          {saveError && (
            <div className="ff-review-save-error" role="alert">
              <span>{saveError}</span>
              <button type="button" onClick={() => { void handleSave(); }}>
                Retry save
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={styles.emptyText}>No feedback items</p>
              <p style={styles.emptySubtext}>Start a new recording to capture feedback</p>
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className="ff-list-item-enter"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <FeedbackItemCard
                  item={item}
                  index={index}
                  isSelected={selectedIndex === index}
                  isEditing={editingIndex === index}
                  isDragging={dragIndex === index}
                  dragOverIndex={dragOverIndex}
                  onSelect={() => setSelectedIndex(index)}
                  onStartEdit={() => setEditingIndex(index)}
                  onSaveEdit={(newText) => handleSaveEdit(index, newText)}
                  onCancelEdit={() => setEditingIndex(null)}
                  onDelete={() => handleDelete(index)}
                  onCategoryChange={(cat) => handleCategoryChange(index, cat)}
                  onSeverityChange={(sev) => handleSeverityChange(index, sev)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onThumbnailClick={setLightboxImage}
                />
              </div>
            ))
          )}

          <div style={styles.shortcutsHint} className="markuprx-review-shortcuts">
            <span style={styles.shortcutKey}>Arrow</span> Navigate
            <span style={styles.shortcutKey}>Enter</span> Edit
            <span style={styles.shortcutKey}>Del</span> Remove
            <span style={styles.shortcutKey}>Drag</span> Reorder
          </div>
        </div>

        {showPreview && (
          <div id="markuprx-review-preview" className="ff-review-preview">
            <MarkdownPreview session={currentSession} projectName={session.metadata?.sourceName} />
          </div>
        )}
      </PortraitSurface>

      {deletedItems.length > 0 && (
        <div style={styles.toastContainer} className="ff-toast-enter">
          {deletedItems.map((deleted) => (
            <DeleteUndoToast
              key={deleted.item.id}
              itemId={`FB-${(deleted.index + 1).toString().padStart(3, '0')}`}
              onUndo={() => handleUndo(deleted)}
              progress={undoProgress}
            />
          ))}
        </div>
      )}

      {lightboxImage && (
        <ImageLightbox imagePath={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  // Card
  card: {
    display: 'flex',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    cursor: 'grab',
    opacity: 0.5,
    color: 'var(--text-tertiary)',
    transition: 'opacity 0.15s ease',
  },
  cardContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemId: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 6,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: 4,
    zIndex: 100,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
    minWidth: 120,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    textAlign: 'left',
  },
  cardActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 4,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    backgroundColor: 'var(--surface-inset)',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  transcription: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--text-primary)',
    wordBreak: 'break-word',
  },
  editTextarea: {
    width: '100%',
    minHeight: 80,
    padding: 12,
    backgroundColor: 'var(--surface-inset)',
    border: '2px solid var(--border-focus)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.6,
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
    animation: 'pulseBorder 1.5s ease-in-out infinite',
  },
  thumbnailRow: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  thumbnail: {
    width: 60,
    height: 45,
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--surface-inset)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    padding: 0,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Preview
  previewContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-default)',
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  previewContent: {
    flex: 1,
    padding: 16,
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    backgroundColor: 'transparent',
  },

  // Toast
  toastContainer: {
    position: 'absolute',
    right: 12,
    bottom: 56,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    maxWidth: 'calc(100% - 24px)',
    zIndex: 1000,
  },
  toast: {
    width: 'min(100%, 360px)',
    maxWidth: '100%',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    padding: 0,
    overflow: 'hidden',
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5)',
    animation: 'toastSlideIn 0.3s ease-out',
    minWidth: 240,
  },
  toastContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
  },
  toastText: {
    fontSize: 13,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  undoButton: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid var(--accent-muted)',
    borderRadius: 6,
    color: 'var(--text-link)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toastProgress: {
    height: 3,
    backgroundColor: 'var(--surface-inset)',
  },
  toastProgressBar: {
    height: '100%',
    backgroundColor: 'var(--status-error)',
    transition: 'width 0.1s linear',
  },

  // Lightbox
  lightboxOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    animation: 'pageFadeIn 0.2s ease-out',
    cursor: 'zoom-out',
  },
  lightboxClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--text-inverse)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: 8,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    cursor: 'default',
  },

  // Empty State
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 13,
    color: 'var(--text-tertiary)',
  },

  // Keyboard Shortcuts Hint
  shortcutsHint: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  shortcutKey: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    padding: '2px 6px',
    marginRight: 4,
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
};

export { SessionReview };
export type { SessionReviewProps };
