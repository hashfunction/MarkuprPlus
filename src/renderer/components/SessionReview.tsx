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
  ReviewFeedbackItem as FeedbackItem,
  ReviewFeedbackCategory as FeedbackCategory,
  ReviewFeedbackSeverity as FeedbackSeverity,
} from '../../shared/types';
import { getContrastColor, useTheme } from '../hooks/useTheme';
import {
  isReviewDraftDirty,
  type ReviewDraftAction,
  type ReviewDraftState,
} from '../reviewDraftState';
import { PortraitSurface } from './PortraitSurface';

// ============================================================================
// Types
// ============================================================================

interface SessionReviewProps {
  draft: ReviewDraftState;
  onDraftAction: (action: ReviewDraftAction) => void;
  onSave: (session: ReviewDraftState['session'], sessionKey: string, revision: number) => Promise<void>;
  onCopy: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
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
  isMenuOpen: boolean;
  isTabStop: boolean;
  editText: string;
  dragOverIndex: number | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditTextChange: (newText: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onCategoryChange: (category: FeedbackCategory) => void;
  onSeverityChange: (severity: FeedbackSeverity) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onThumbnailClick: (imagePath: string, trigger: HTMLButtonElement) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  cardRef: (element: HTMLDivElement | null) => void;
}

const FeedbackItemCard: React.FC<FeedbackItemCardProps> = ({
  item,
  index,
  isSelected,
  isEditing,
  isDragging,
  isMenuOpen,
  isTabStop,
  editText,
  dragOverIndex,
  canMoveUp,
  canMoveDown,
  onSelect,
  onStartEdit,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCategoryChange,
  onSeverityChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onThumbnailClick,
  onToggleMenu,
  onCloseMenu,
  onMoveUp,
  onMoveDown,
  cardRef,
}) => {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeverityDropdown, setShowSeverityDropdown] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { colors } = useTheme();

  const CATEGORY_COLORS = useMemo((): Record<FeedbackCategory, string> => ({
    Bug: colors.status.error,
    'UX Issue': colors.status.warning,
    Suggestion: colors.accent.default,
    Performance: colors.status.success,
    Question: colors.status.info,
    General: colors.text.tertiary,
  }), [colors]);

  const CATEGORY_BACKGROUNDS = useMemo((): Record<FeedbackCategory, string> => ({
    Bug: colors.status.errorSubtle,
    'UX Issue': colors.status.warningSubtle,
    Suggestion: colors.accent.subtle,
    Performance: colors.status.successSubtle,
    Question: colors.status.infoSubtle,
    General: colors.bg.tertiary,
  }), [colors]);

  const SEVERITY_COLORS = useMemo((): Record<FeedbackSeverity, string> => ({
    Critical: colors.status.error,
    High: colors.status.warning,
    Medium: colors.status.warning,
    Low: colors.status.success,
  }), [colors]);

  const SEVERITY_BACKGROUNDS = useMemo((): Record<FeedbackSeverity, string> => ({
    Critical: colors.status.errorSubtle,
    High: colors.status.warningSubtle,
    Medium: colors.status.warningSubtle,
    Low: colors.status.successSubtle,
  }), [colors]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isMenuOpen) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [isMenuOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  };

  const category = item.category || 'General';
  const severity = item.severity || 'Medium';
  const isDropTarget = dragOverIndex === index && !isDragging;
  const itemLabel = `FB-${(index + 1).toString().padStart(3, '0')}`;
  const menuId = `markuprx-feedback-actions-${item.id}`;

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ) ?? [])];
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCloseMenu();
      queueMicrotask(() => moreButtonRef.current?.focus());
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || menuItems.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') {
      menuItems[0].focus();
    } else if (event.key === 'End') {
      menuItems[menuItems.length - 1].focus();
    } else {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + menuItems.length) % menuItems.length;
      menuItems[nextIndex].focus();
    }
  };

  return (
    <div
      ref={cardRef}
      role="listitem"
      aria-label={`Feedback ${itemLabel}`}
      aria-current={isSelected ? 'true' : undefined}
      tabIndex={isTabStop ? 0 : -1}
      className={`ff-review-item${isSelected ? ' is-selected' : ''}`}
      draggable={!isEditing && !isMenuOpen}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onFocus={(event) => {
        if (event.currentTarget === event.target) onSelect();
      }}
      onDoubleClick={onStartEdit}
      onMouseLeave={() => {
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
          <span style={styles.itemId}>{itemLabel}</span>

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
                backgroundColor: CATEGORY_BACKGROUNDS[category],
                color: colors.text.primary,
                borderColor: CATEGORY_COLORS[category],
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
                backgroundColor: SEVERITY_BACKGROUNDS[severity],
                color: colors.text.primary,
                borderColor: SEVERITY_COLORS[severity],
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

          {!isEditing && (
            <button
              ref={moreButtonRef}
              type="button"
              className="ff-review-item__more"
              aria-label={`More actions for feedback ${itemLabel}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-controls={isMenuOpen ? menuId : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
                onToggleMenu();
              }}
            >
              <span aria-hidden="true">•••</span>
            </button>
          )}
        </div>

        {isMenuOpen && (
          <div
            ref={menuRef}
            id={menuId}
            className="ff-review-item__menu"
            role="menu"
            aria-label={`Feedback actions for ${itemLabel}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onCloseMenu();
                onStartEdit();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canMoveUp}
              onClick={() => {
                onCloseMenu();
                onMoveUp();
              }}
            >
              Move Up
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canMoveDown}
              onClick={() => {
                onCloseMenu();
                onMoveDown();
              }}
            >
              Move Down
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-destructive"
              onClick={() => {
                onCloseMenu();
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        )}

        {/* Transcription */}
        {isEditing ? (
          <textarea
            ref={editInputRef}
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
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
                  onThumbnailClick(screenshot.imagePath, e.currentTarget);
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
  session: ReviewDraftState['session'];
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
  returnFocus: HTMLButtonElement;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imagePath, returnFocus, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), '
          + 'textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const shouldWrapBackward = e.shiftKey && activeIndex <= 0;
      const shouldWrapForward = !e.shiftKey && activeIndex === focusable.length - 1;
      if (activeIndex < 0 || shouldWrapBackward || shouldWrapForward) {
        e.preventDefault();
        const target = shouldWrapBackward ? focusable[focusable.length - 1] : focusable[0];
        target.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (returnFocus.isConnected) returnFocus.focus();
    };
  }, [onClose, returnFocus]);

  return (
    <div
      ref={dialogRef}
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
  draft,
  onDraftAction,
  onSave,
  onCopy,
  onOpenFolder,
  onClose,
}) => {
  const { colors } = useTheme();
  const { session } = draft;
  const items = session.feedbackItems;
  const selectedIndex = draft.selectedItemId === null
    ? null
    : items.findIndex((item) => item.id === draft.selectedItemId);
  const editingIndex = draft.editing === null
    ? null
    : items.findIndex((item) => item.id === draft.editing?.itemId);
  const hasChanges = isReviewDraftDirty(draft);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    imagePath: string;
    returnFocus: HTMLButtonElement;
  } | null>(null);
  const [undoNow, setUndoNow] = useState(Date.now());
  const [showPreview, setShowPreview] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const handleOpenLightbox = useCallback((
    imagePath: string,
    returnFocus: HTMLButtonElement,
  ) => {
    setLightbox({ imagePath, returnFocus });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  // Undo progress timer
  useEffect(() => {
    if (draft.deletedItems.length === 0) return;
    const updateUndoState = () => {
      const now = Date.now();
      setUndoNow(now);
      for (const deleted of draft.deletedItems) {
        if (deleted.expiresAt <= now) {
          onDraftAction({ type: 'expire-delete', itemId: deleted.item.id });
        }
      }
    };
    updateUndoState();
    const interval = setInterval(updateUndoState, UNDO_DURATION_MS / 50);

    return () => clearInterval(interval);
  }, [draft.deletedItems, onDraftAction]);

  // Handlers
  const handleDelete = useCallback((itemId: string) => {
    onDraftAction({
      type: 'delete-item',
      itemId,
      expiresAt: Date.now() + UNDO_DURATION_MS,
    });
    setOpenMenuItemId(null);
  }, [onDraftAction]);

  // Handle keyboard navigation (must be after handleDelete is defined)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if editing
      if (editingIndex !== null || openMenuItemId !== null) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('button, input, textarea, select, [role="menu"]')
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (items.length > 0) {
            const nextIndex = selectedIndex === null
              ? items.length - 1
              : Math.max(0, selectedIndex - 1);
            const nextItem = items[nextIndex];
            onDraftAction({ type: 'select-item', itemId: nextItem.id });
            cardRefs.current.get(nextItem.id)?.focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (items.length > 0) {
            const nextIndex = selectedIndex === null
              ? 0
              : Math.min(items.length - 1, selectedIndex + 1);
            const nextItem = items[nextIndex];
            onDraftAction({ type: 'select-item', itemId: nextItem.id });
            cardRefs.current.get(nextItem.id)?.focus();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedIndex !== null && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleDelete(items[selectedIndex].id);
          }
          break;
        case 'Enter':
          if (selectedIndex !== null) {
            e.preventDefault();
            onDraftAction({ type: 'start-edit', itemId: items[selectedIndex].id });
          }
          break;
        case 'Escape':
          onDraftAction({ type: 'select-item', itemId: null });
          onDraftAction({ type: 'cancel-edit' });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, editingIndex, openMenuItemId, handleDelete, onDraftAction]);

  const handleCategoryChange = useCallback(
    (itemId: string, category: FeedbackCategory) => {
      onDraftAction({ type: 'update-item', itemId, changes: { category } });
    },
    [onDraftAction]
  );

  const handleSeverityChange = useCallback(
    (itemId: string, severity: FeedbackSeverity) => {
      onDraftAction({ type: 'update-item', itemId, changes: { severity } });
    },
    [onDraftAction]
  );

  const handleMove = useCallback((itemId: string, toIndex: number) => {
    onDraftAction({ type: 'move-item', itemId, toIndex });
    setOpenMenuItemId(null);
  }, [onDraftAction]);

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
      handleMove(items[dragIndex].id, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, handleMove, items]);

  const handleSave = useCallback(() => {
    if (!hasChanges || draft.savingRevision !== null || draft.editing !== null) return;
    void onSave(draft.session, draft.sessionKey, draft.revision);
  }, [draft, hasChanges, onSave]);

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
              disabled={!hasChanges || draft.savingRevision !== null || draft.editing !== null}
              aria-busy={draft.savingRevision !== null}
              title={draft.editing ? 'Finish or cancel the active edit before saving' : undefined}
              style={{
                backgroundColor: colors.accent.default,
                borderColor: colors.accent.default,
                color: getContrastColor(colors.accent.default),
              }}
              onClick={handleSave}
            >
              {draft.savingRevision !== null ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        )}
      >
        <div className="ff-review-items">
          {draft.saveError && (
            <div className="ff-review-save-error" role="alert">
              <span>{draft.saveError}</span>
              <button type="button" disabled={draft.savingRevision !== null} onClick={handleSave}>
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
            <div className="ff-review-list" role="list" aria-label="Feedback items list">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="ff-list-item-enter"
                  role="presentation"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <FeedbackItemCard
                    item={item}
                    index={index}
                    isSelected={selectedIndex === index}
                    isEditing={editingIndex === index}
                    isDragging={dragIndex === index}
                    isMenuOpen={openMenuItemId === item.id}
                    isTabStop={selectedIndex === index || (selectedIndex === null && index === 0)}
                    editText={draft.editing?.itemId === item.id
                      ? draft.editing.text
                      : item.transcription}
                    dragOverIndex={dragOverIndex}
                    canMoveUp={index > 0}
                    canMoveDown={index < items.length - 1}
                    onSelect={() => onDraftAction({ type: 'select-item', itemId: item.id })}
                    onStartEdit={() => onDraftAction({ type: 'start-edit', itemId: item.id })}
                    onEditTextChange={(text) => onDraftAction({ type: 'update-edit', text })}
                    onSaveEdit={() => onDraftAction({ type: 'commit-edit' })}
                    onCancelEdit={() => onDraftAction({ type: 'cancel-edit' })}
                    onDelete={() => handleDelete(item.id)}
                    onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
                    onSeverityChange={(sev) => handleSeverityChange(item.id, sev)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onThumbnailClick={handleOpenLightbox}
                    onToggleMenu={() => setOpenMenuItemId((current) => (
                      current === item.id ? null : item.id
                    ))}
                    onCloseMenu={() => setOpenMenuItemId(null)}
                    onMoveUp={() => handleMove(item.id, index - 1)}
                    onMoveDown={() => handleMove(item.id, index + 1)}
                    cardRef={(element) => {
                      if (element) cardRefs.current.set(item.id, element);
                      else cardRefs.current.delete(item.id);
                    }}
                  />
                </div>
              ))}
            </div>
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
            <MarkdownPreview session={session} projectName={session.metadata?.sourceName} />
          </div>
        )}
      </PortraitSurface>

      {draft.deletedItems.length > 0 && (
        <div style={styles.toastContainer} className="ff-toast-enter">
          {draft.deletedItems.map((deleted) => (
            <DeleteUndoToast
              key={deleted.item.id}
              itemId={`FB-${(deleted.index + 1).toString().padStart(3, '0')}`}
              onUndo={() => onDraftAction({ type: 'undo-delete', itemId: deleted.item.id })}
              progress={Math.max(
                0,
                Math.min(100, ((deleted.expiresAt - undoNow) / UNDO_DURATION_MS) * 100),
              )}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          imagePath={lightbox.imagePath}
          returnFocus={lightbox.returnFocus}
          onClose={handleCloseLightbox}
        />
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
    transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, opacity 0.2s ease',
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
