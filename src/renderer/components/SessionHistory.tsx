/**
 * SessionHistory - Professional Data Management Experience
 *
 * A comprehensive session browser for viewing, searching, and managing past feedback sessions.
 *
 * Features:
 * - List all sessions with thumbnails and metadata
 * - Search by content (transcription text, project name)
 * - Sort/Filter by date, name, item count
 * - Quick preview on hover
 * - Actions: Open, delete, export, copy, open folder
 * - Bulk actions: Select multiple, delete/export batch
 * - Virtual scrolling for large lists
 * - Full keyboard navigation
 * - Context menu support
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Skeleton, SkeletonText } from './Skeleton';
import { PortraitSurface } from './PortraitSurface';
import {
  hasActiveContainedDialog,
  isTopmostContainedDialog,
  useContainedDialogFocus,
} from '../hooks/useContainedDialogFocus';
import { useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

/**
 * Re-export SessionMetadata for external usage
 * The actual interface is defined in electron.d.ts as SessionHistoryItem
 */
export interface SessionMetadata {
  id: string;
  startTime: number;
  endTime: number;
  itemCount: number;
  screenshotCount: number;
  sourceName: string;
  firstThumbnail?: string;
  folder: string;
  transcriptionPreview?: string;
}

interface SessionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSession: (session: SessionMetadata) => void;
}

type SortOption = 'date' | 'name' | 'items' | 'duration';
type SortDirection = 'asc' | 'desc';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  sessionId: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target.closest(
    'button, input, textarea, select, a, [contenteditable="true"], [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="menuitem"]',
  ) !== null;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Session Card - Individual session item
 */
interface SessionCardProps {
  session: SessionMetadata;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (shift: boolean, ctrl: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
  onMoreActions: (anchor: DOMRect, trigger: HTMLButtonElement) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isSelected,
  isFocused,
  onSelect,
  onOpen,
  onDelete,
  onMoreActions,
  onContextMenu,
}) => {
  const { colors } = useTheme();
  const duration = session.endTime - session.startTime;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(e.shiftKey, e.metaKey || e.ctrlKey);
    },
    [onSelect]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen();
    },
    [onOpen]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        onOpen();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
      }
    },
    [onOpen, onDelete]
  );

  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      style={{
        ...styles.sessionCard,
        backgroundColor: isSelected
          ? colors.accent.subtle
          : colors.surface.inset,
        borderColor: isSelected
          ? colors.accent.muted
          : isFocused
          ? colors.border.focus
          : colors.border.subtle,
        boxShadow: isSelected ? `0 4px 12px -2px ${colors.accent.subtle}` : 'none',
      }}
    >
      {/* Checkbox */}
      <div
        style={{
          ...styles.checkbox,
          backgroundColor: isSelected ? colors.accent.default : 'transparent',
          borderColor: isSelected ? colors.accent.default : colors.text.tertiary,
        }}
      >
        {isSelected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6l2.5 2.5 4.5-4.5"
              stroke={colors.text.inverse}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Thumbnail */}
      <div style={styles.thumbnail}>
        {session.firstThumbnail ? (
          <img
            src={`file://${session.firstThumbnail}`}
            alt="Session thumbnail"
            style={styles.thumbnailImage}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div style={styles.thumbnailPlaceholder}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-tertiary)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={styles.sessionContent}>
        <div style={styles.sessionHeader}>
          <span style={styles.sessionName}>{session.sourceName || 'Untitled Session'}</span>
          <span style={styles.sessionDate}>{formatRelativeDate(session.startTime)}</span>
        </div>
        <div style={styles.sessionMeta}>
          <span style={styles.metaItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v10l4 2" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            {formatDuration(duration)}
          </span>
          <span style={styles.metaItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            {session.screenshotCount}
          </span>
          <span style={styles.metaItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {session.itemCount} items
          </span>
        </div>
        {session.transcriptionPreview && (
          <p style={styles.transcriptionPreview}>
            {session.transcriptionPreview.slice(0, 80)}
            {session.transcriptionPreview.length > 80 ? '...' : ''}
          </p>
        )}
      </div>

      <div style={styles.cardActions}>
        <button
          type="button"
          style={styles.openSessionButton}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          aria-label="Open session"
        >
          Open
        </button>
        <button
          type="button"
          style={styles.moreActionsButton}
          onClick={(event) => {
            event.stopPropagation();
            onMoreActions(event.currentTarget.getBoundingClientRect(), event.currentTarget);
          }}
          aria-label="More actions for session"
        >
          <span aria-hidden="true">•••</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Search Input with clear button
 */
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search sessions...' }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={styles.searchContainer}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ ...styles.searchIcon, color: 'var(--text-tertiary)' }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={styles.searchInput}
      />
      {value && (
        <button
          type="button"
          style={styles.clearButton}
          aria-label="Clear session search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </button>
      )}
    </div>
  );
};

/**
 * Sort Dropdown
 */
const SortDropdown: React.FC<{
  sortBy: SortOption;
  direction: SortDirection;
  onSortChange: (sort: SortOption) => void;
  onDirectionToggle: () => void;
}> = ({ sortBy, direction, onSortChange, onDirectionToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'items', label: 'Item Count' },
    { value: 'duration', label: 'Duration' },
  ];

  const currentLabel = sortOptions.find((opt) => opt.value === sortBy)?.label || 'Date';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={styles.sortDropdown}>
      <button style={styles.sortButton} onClick={() => setIsOpen(!isOpen)}>
        <span>Sort: {currentLabel}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M3 5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        style={{
          ...styles.directionButton,
          transform: direction === 'asc' ? 'rotate(180deg)' : 'none',
        }}
        onClick={onDirectionToggle}
        title={direction === 'desc' ? 'Newest first' : 'Oldest first'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div style={styles.sortDropdownMenu}>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              style={{
                ...styles.sortDropdownItem,
                backgroundColor: sortBy === option.value ? 'var(--accent-subtle)' : 'transparent',
              }}
              onClick={() => {
                onSortChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
              {sortBy === option.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-default)" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Context Menu
 */
const ContextMenu: React.FC<{
  state: ContextMenuState;
  onClose: (restoreFocus?: boolean) => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onExport: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
}> = ({ state, onClose, onOpen, onOpenFolder, onExport, onDelete, onSelectAll }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!state.visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const focusItem = (index: number) => {
        menuItems[index]?.focus();
      };

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose(true);
      } else if (menuItems.length > 0 && e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusItem((currentIndex + 1 + menuItems.length) % menuItems.length);
      } else if (menuItems.length > 0 && e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusItem((currentIndex - 1 + menuItems.length) % menuItems.length);
      } else if (menuItems.length > 0 && e.key === 'Home') {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusItem(0);
      } else if (menuItems.length > 0 && e.key === 'End') {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusItem(menuItems.length - 1);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, state.visible]);

  useEffect(() => {
    if (state.visible) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Session actions"
      style={{
        ...styles.contextMenu,
        top: state.y,
        left: state.x,
      }}
    >
      <button type="button" role="menuitem" style={styles.contextMenuItem} onClick={onOpen}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Open
      </button>
      <button type="button" role="menuitem" style={styles.contextMenuItem} onClick={onOpenFolder}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        Open Folder
      </button>
      <div style={styles.contextMenuDivider} />
      <button type="button" role="menuitem" style={styles.contextMenuItem} onClick={onExport}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>
      <button type="button" role="menuitem" style={styles.contextMenuItem} onClick={onSelectAll}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <path d="M9 9h6v6H9z" />
        </svg>
        Select All
      </button>
      <div style={styles.contextMenuDivider} />
      <button type="button" role="menuitem" style={{ ...styles.contextMenuItem, color: 'var(--status-error)' }} onClick={onDelete}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        Delete
      </button>
    </div>
  );
};

/**
 * Delete Confirmation Dialog
 */
const DeleteConfirmDialog: React.FC<{
  isOpen: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, count, onConfirm, onCancel }) => {
  const dialogRef = useContainedDialogFocus<HTMLDivElement>(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape'
        && dialogRef.current
        && isTopmostContainedDialog(dialogRef.current)
      ) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, dialogRef]);

  if (!isOpen) return null;

  return (
    <div className="ff-contained-dialog-layer" style={styles.dialogOverlay}>
      <div style={styles.dialogBackdrop} onClick={onCancel} />
      <div
        ref={dialogRef}
        className="ff-contained-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markuprx-delete-sessions-title"
        aria-describedby="markuprx-history-delete-message"
        tabIndex={-1}
        style={styles.dialog}
      >
        <div className="ff-contained-dialog__body" style={styles.dialogBody}>
          <div style={styles.dialogIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--status-error)" strokeWidth="1.5">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
          <h3 id="markuprx-delete-sessions-title" style={styles.dialogTitle}>
            Delete {count} session{count > 1 ? 's' : ''}?
          </h3>
          <p id="markuprx-history-delete-message" style={styles.dialogMessage}>
            This will permanently delete the session{count > 1 ? 's' : ''} and all associated screenshots. This action
            cannot be undone.
          </p>
        </div>
        <div className="ff-contained-dialog__actions" style={styles.dialogButtons}>
          <button type="button" style={styles.dialogCancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" style={styles.dialogDeleteButton} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Empty State
 */
const EmptyState: React.FC<{ hasSearch: boolean; onClear: () => void }> = ({ hasSearch, onClear }) => (
  <div style={styles.emptyState}>
    <div style={styles.emptyIcon}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--text-tertiary)' }}>
        {hasSearch ? (
          <>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M8 11h6" strokeWidth="1.5" />
          </>
        ) : (
          <>
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            <path d="M12 11v6M9 14h6" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
    <h3 style={styles.emptyTitle}>{hasSearch ? 'No sessions found' : 'No sessions yet'}</h3>
    <p style={styles.emptyMessage}>
      {hasSearch
        ? "Try adjusting your search terms or clear the filter to see all sessions."
        : 'Start recording feedback to see your sessions here.'}
    </p>
    {hasSearch && (
      <button style={styles.emptyClearButton} onClick={onClear}>
        Clear Search
      </button>
    )}
  </div>
);

/**
 * Loading State
 */
const LoadingState: React.FC = () => (
  <div style={styles.loadingContainer}>
    {Array.from({ length: 5 }).map((_, index) => (
      <div
        key={index}
        style={{
          ...styles.skeletonCard,
          animationDelay: `${index * 100}ms`,
        }}
        className="ff-list-item-enter"
      >
        <Skeleton width={20} height={20} rounded={4} />
        <Skeleton width={80} height={56} rounded={8} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
          <SkeletonText lines={1} animation="shimmer" />
        </div>
      </div>
    ))}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export function SessionHistory({ isOpen, onClose, onOpenSession }: SessionHistoryProps) {
  // State
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    sessionId: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    sessionIds: string[];
  }>({ isOpen: false, sessionIds: [] });

  const listRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      if (!window.markuprx?.output?.listSessions) {
        throw new Error('Session history is unavailable.');
      }
      setSessions(await window.markuprx.output.listSessions());
    } catch (error) {
      setSessions([]);
      setLoadError(
        error instanceof Error ? error.message : 'Unable to load session history.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load sessions on mount/open.
  useEffect(() => {
    if (!isOpen) return;

    void loadSessions();
    setSelected(new Set());
    setFocusedIndex(-1);
  }, [isOpen, loadSessions]);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.sourceName.toLowerCase().includes(searchLower) ||
          (s.transcriptionPreview && s.transcriptionPreview.toLowerCase().includes(searchLower))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = b.startTime - a.startTime;
          break;
        case 'name':
          comparison = (a.sourceName || '').localeCompare(b.sourceName || '');
          break;
        case 'items':
          comparison = b.itemCount - a.itemCount;
          break;
        case 'duration':
          comparison = (b.endTime - b.startTime) - (a.endTime - a.startTime);
          break;
      }

      return sortDirection === 'desc' ? comparison : -comparison;
    });

    return result;
  }, [sessions, search, sortBy, sortDirection]);

  // Handlers
  const handleSelectSession = useCallback(
    (sessionId: string, shift: boolean, ctrl: boolean) => {
      setSelected((prev) => {
        const newSet = new Set(prev);

        if (shift && focusedIndex >= 0) {
          // Range selection
          const currentIndex = filteredSessions.findIndex((s) => s.id === sessionId);
          const start = Math.min(focusedIndex, currentIndex);
          const end = Math.max(focusedIndex, currentIndex);

          for (let i = start; i <= end; i++) {
            newSet.add(filteredSessions[i].id);
          }
        } else if (ctrl) {
          // Toggle selection
          if (newSet.has(sessionId)) {
            newSet.delete(sessionId);
          } else {
            newSet.add(sessionId);
          }
        } else {
          // Single selection
          newSet.clear();
          newSet.add(sessionId);
        }

        return newSet;
      });

      // Update focused index
      const index = filteredSessions.findIndex((s) => s.id === sessionId);
      if (index >= 0) {
        setFocusedIndex(index);
      }
    },
    [filteredSessions, focusedIndex]
  );

  const handleOpenSession = useCallback(
    (session: SessionMetadata) => {
      onOpenSession(session);
      onClose();
    },
    [onOpenSession, onClose]
  );

  const handleDeleteSessions = useCallback((sessionIds: string[]) => {
    setDeleteConfirm({ isOpen: true, sessionIds });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const { sessionIds } = deleteConfirm;

    try {
      // Call the IPC API to delete sessions
      if (window.markuprx?.output?.deleteSessions) {
        const result = await window.markuprx.output.deleteSessions(sessionIds);
        if (result.success) {
          // Remove successfully deleted sessions from state
          setSessions((prev) => prev.filter((s) => !result.deleted.includes(s.id)));
          setSelected((prev) => {
            const newSet = new Set(prev);
            result.deleted.forEach((id) => newSet.delete(id));
            return newSet;
          });
        }
        if (result.failed.length > 0) {
          console.warn('Some sessions failed to delete:', result.failed);
          setActionError(
            `Unable to delete ${result.failed.length} session${result.failed.length === 1 ? '' : 's'}.`,
          );
        } else if (result.success) {
          setActionError(null);
        } else {
          setActionError('Unable to delete sessions.');
        }
      } else {
        // Fallback: just remove from local state
        setSessions((prev) => prev.filter((s) => !sessionIds.includes(s.id)));
        setSelected((prev) => {
          const newSet = new Set(prev);
          sessionIds.forEach((id) => newSet.delete(id));
          return newSet;
        });
        setActionError(null);
      }
    } catch (error) {
      console.error('Failed to delete sessions:', error);
      setActionError('Unable to delete sessions.');
    }

    setDeleteConfirm({ isOpen: false, sessionIds: [] });
  }, [deleteConfirm]);

  const handleExportSessions = useCallback(async (sessionIds: string[]) => {
    try {
      // Call the IPC API to export sessions
      if (window.markuprx?.output?.exportSessions) {
        const result = await window.markuprx.output.exportSessions(sessionIds);
        if (result.success && result.path) {
          console.log('Sessions exported to:', result.path);
          // Optionally open the folder containing the export
          const openResult = await window.markuprx.output.openFolder(result.path);
          if (openResult.success) {
            setActionError(null);
          } else {
            setActionError(openResult.error ?? 'Unable to open the exported sessions folder.');
          }
        } else if (result.error) {
          console.error('Export failed:', result.error);
          setActionError(result.error);
        } else {
          setActionError('Unable to export sessions.');
        }
      } else {
        console.warn('[SessionHistory] exportSessions API not available');
        setActionError('Session export is unavailable.');
      }
    } catch (error) {
      console.error('Failed to export sessions:', error);
      setActionError('Unable to export sessions.');
    }
  }, []);

  const handleOpenFolder = useCallback(async (session: SessionMetadata) => {
    try {
      const result = await window.markuprx.output.openFolder(session.folder);
      if (result.success) {
        setActionError(null);
      } else {
        setActionError(result.error ?? 'Unable to open the session folder.');
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      setActionError('Unable to open the session folder.');
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(filteredSessions.map((s) => s.id)));
  }, [filteredSessions]);

  const handleDeselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const closeSessionMenu = useCallback((restoreFocus = false) => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
    if (restoreFocus) {
      const trigger = menuTriggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    }
  }, []);

  const openSessionMenu = useCallback(
    (sessionId: string, x: number, y: number, trigger: HTMLElement | null) => {
      const margin = 8;
      const menuWidth = 220;
      const menuHeight = 230;
      setContextMenu({
        visible: true,
        sessionId,
        x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
        y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
      });
      menuTriggerRef.current = trigger;
    },
    [],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, sessionId: string) => {
      event.preventDefault();
      openSessionMenu(sessionId, event.clientX, event.clientY, event.currentTarget as HTMLElement);
    },
    [openSessionMenu],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === 'Escape') {
        if (hasActiveContainedDialog()) return;
        if (contextMenu.visible) {
          setContextMenu((prev) => ({ ...prev, visible: false }));
        } else {
          onClose();
        }
        return;
      }

      if (isInteractiveShortcutTarget(e.target)) return;

      // Navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filteredSessions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === ' ' && focusedIndex >= 0) {
        e.preventDefault();
        const session = filteredSessions[focusedIndex];
        handleSelectSession(session.id, e.shiftKey, true);
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const session = filteredSessions[focusedIndex];
        handleOpenSession(session);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size > 0 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          handleDeleteSessions(Array.from(selected));
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    filteredSessions,
    focusedIndex,
    selected,
    contextMenu.visible,
    deleteConfirm.isOpen,
    handleSelectSession,
    handleOpenSession,
    handleDeleteSessions,
    handleSelectAll,
    onClose,
  ]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedIndex]);

  if (!isOpen) return null;

  return (
    <>
      <style>
        {`
          .markuprx-history-scrollbar::-webkit-scrollbar {
            width: 8px;
          }

          .markuprx-history-scrollbar::-webkit-scrollbar-track {
            background: var(--surface-inset);
            border-radius: 4px;
          }

          .markuprx-history-scrollbar::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 4px;
          }

          .markuprx-history-scrollbar::-webkit-scrollbar-thumb:hover {
            background: var(--text-tertiary);
          }
        `}
      </style>

      <PortraitSurface
        title="Session History"
        titleId="markuprx-history-title"
        backLabel="Back to MarkuprX"
        onBack={onClose}
        subtitle={
          !isLoading
            ? filteredSessions.length + ' session' + (filteredSessions.length === 1 ? '' : 's')
            : 'Loading sessions'
        }
        contentLabel="Saved sessions"
      >
        <div style={styles.portraitBody}>
          {loadError && (
            <div role="alert" style={styles.errorBanner}>
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadSessions()}>Retry</button>
            </div>
          )}
          {actionError && (
            <div role="alert" style={styles.errorBanner}>
              <span>{actionError}</span>
              <button type="button" onClick={() => setActionError(null)}>Dismiss</button>
            </div>
          )}
          <SearchInput value={search} onChange={setSearch} />
          <div style={styles.portraitToolbar}>
            <SortDropdown
              sortBy={sortBy}
              direction={sortDirection}
              onSortChange={setSortBy}
              onDirectionToggle={() => setSortDirection((value) => (value === 'desc' ? 'asc' : 'desc'))}
            />
            {selected.size > 0 && (
              <div style={styles.selectionActions}>
                <span style={styles.selectedCount}>{selected.size} selected</span>
                <button type="button" style={styles.deselectButton} onClick={handleDeselectAll}>Clear</button>
                <button type="button" style={styles.bulkButton} onClick={() => void handleExportSessions(Array.from(selected))}>Export</button>
                <button type="button" style={{ ...styles.bulkButton, ...styles.deleteButton }} onClick={() => handleDeleteSessions(Array.from(selected))}>Delete</button>
              </div>
            )}
          </div>
          <div
            ref={listRef}
            style={styles.content}
            className="markuprx-history-scrollbar"
            role={isLoading || filteredSessions.length === 0 ? undefined : 'list'}
          >
          {isLoading ? (
            <LoadingState />
          ) : filteredSessions.length === 0 ? (
            <EmptyState hasSearch={!!search} onClear={() => setSearch('')} />
          ) : (
            filteredSessions.map((session, index) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selected.has(session.id)}
                isFocused={focusedIndex === index}
                onSelect={(shift, ctrl) => handleSelectSession(session.id, shift, ctrl)}
                onOpen={() => handleOpenSession(session)}
                onDelete={() => handleDeleteSessions([session.id])}
                onMoreActions={(anchor, trigger) => openSessionMenu(session.id, anchor.right - 220, anchor.bottom + 6, trigger)}
                onContextMenu={(event) => handleContextMenu(event, session.id)}
              />
            ))
          )}
        </div>

        </div>
      </PortraitSurface>

      {/* Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={closeSessionMenu}
        onOpen={() => {
          const session = filteredSessions.find((s) => s.id === contextMenu.sessionId);
          if (session) handleOpenSession(session);
          closeSessionMenu();
        }}
        onOpenFolder={() => {
          const session = filteredSessions.find((s) => s.id === contextMenu.sessionId);
          if (session) handleOpenFolder(session);
          closeSessionMenu();
        }}
        onExport={() => {
          if (contextMenu.sessionId) handleExportSessions([contextMenu.sessionId]);
          closeSessionMenu();
        }}
        onDelete={() => {
          if (contextMenu.sessionId) handleDeleteSessions([contextMenu.sessionId]);
          closeSessionMenu();
        }}
        onSelectAll={() => {
          handleSelectAll();
          closeSessionMenu();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteConfirm.isOpen}
        count={deleteConfirm.sessionIds.length}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, sessionIds: [] })}
      />
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

type ExtendedCSSProperties = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

const styles: Record<string, ExtendedCSSProperties> = {
  portraitBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 14,
    minWidth: 0,
  },

  errorBanner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 10,
    border: '1px solid var(--status-error)',
    borderRadius: 8,
    backgroundColor: 'var(--status-error-subtle)',
    color: 'var(--text-primary)',
    fontSize: 13,
  },

  // Search
  searchContainer: {
    width: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
  },

  searchIcon: {
    position: 'absolute',
    left: 12,
    pointerEvents: 'none',
  },

  searchInput: {
    width: '100%',
    padding: '8px 36px 8px 38px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },

  clearButton: {
    position: 'absolute',
    right: 8,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
  },

  portraitToolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  selectionActions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },

  selectedCount: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text-link)',
    fontWeight: 500,
  },

  deselectButton: {
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: '1px solid var(--accent-subtle)',
    borderRadius: 4,
    color: 'var(--text-link)',
    fontSize: 11,
    cursor: 'pointer',
  },

  // Sort Dropdown
  sortDropdown: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },

  sortButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  directionButton: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  sortDropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 140,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: 4,
    zIndex: 50,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
  },

  sortDropdownItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },

  // Bulk Actions
  bulkButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  deleteButton: {
    backgroundColor: 'var(--status-error-subtle)',
    borderColor: 'var(--status-error)',
    color: 'var(--status-error)',
  },

  // Content
  content: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  // Session Card
  sessionCard: {
    display: 'grid',
    gridTemplateColumns: '28px 72px minmax(0, 1fr)',
    gap: 10,
    padding: 12,
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },

  thumbnail: {
    width: 72,
    height: 56,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'var(--surface-inset)',
    flexShrink: 0,
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
    backgroundColor: 'var(--surface-inset)',
  },

  sessionContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  sessionHeader: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },

  sessionName: {
    minWidth: 0,
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflowWrap: 'anywhere',
  },

  sessionDate: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  sessionMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },

  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },

  transcriptionPreview: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-tertiary)',
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
  },

  cardActions: {
    gridColumn: '2 / -1',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },

  openSessionButton: {
    padding: '7px 12px',
    border: '1px solid var(--accent-muted)',
    borderRadius: 6,
    backgroundColor: 'var(--accent-subtle)',
    color: 'var(--text-link)',
    cursor: 'pointer',
  },

  moreActionsButton: {
    width: 32,
    height: 32,
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Context Menu
  contextMenu: {
    position: 'fixed',
    boxSizing: 'border-box',
    width: 220,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: 4,
    zIndex: 200,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
  },

  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },

  contextMenuDivider: {
    height: 1,
    backgroundColor: 'var(--border-subtle)',
    margin: '4px 0',
  },

  // Delete Dialog
  dialogOverlay: {
    zIndex: 300,
  },

  dialogBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--bg-overlay)',
  },

  dialog: {
    width: 'min(100%, 320px)',
    maxWidth: '100%',
    minWidth: 0,
    textAlign: 'center',
  },

  dialogBody: {
    minWidth: 0,
    padding: 24,
    overflowWrap: 'anywhere',
  },

  dialogIcon: {
    width: 56,
    height: 56,
    margin: '0 auto 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--status-error-subtle)',
    borderRadius: '50%',
  },

  dialogTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 8px',
  },

  dialogMessage: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: '0 0 20px',
    lineHeight: 1.5,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },

  dialogButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },

  dialogCancelButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  dialogDeleteButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: 'var(--status-error)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text-inverse)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
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

  emptyIcon: {
    width: 80,
    height: 80,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--surface-inset)',
    borderRadius: '50%',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    margin: '0 0 8px',
  },

  emptyMessage: {
    fontSize: 13,
    color: 'var(--text-tertiary)',
    margin: '0 0 16px',
    maxWidth: 280,
    lineHeight: 1.5,
  },

  emptyClearButton: {
    padding: '8px 16px',
    backgroundColor: 'var(--accent-subtle)',
    border: '1px solid var(--accent-muted)',
    borderRadius: 6,
    color: 'var(--text-link)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  skeletonCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'var(--surface-inset)',
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--surface-glass)',
  },

  footerLeft: {
    display: 'flex',
    alignItems: 'center',
  },

  footerHint: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },

  kbd: {
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
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },

  closeFooterButton: {
    padding: '8px 20px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};

export default SessionHistory;
