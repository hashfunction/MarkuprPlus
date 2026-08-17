/**
 * MarkuprX Keyboard Shortcuts Panel
 *
 * A comprehensive cheatsheet and customization interface featuring:
 * - Organized shortcuts by category (Recording, Navigation, Editing, Annotation)
 * - Real-time search/filter functionality
 * - Platform-aware display (Cmd on macOS, Ctrl on Windows)
 * - Click-to-rebind with conflict detection (for customizable shortcuts)
 * - Accessible portrait surface with keyboard navigation
 *
 * Design: Follows macOS keyboard shortcut panel conventions
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PortraitSurface } from './PortraitSurface';

// ============================================================================
// Types
// ============================================================================

interface Shortcut {
  id: string;
  label: string;
  description?: string;
  keys: string;
  category: ShortcutCategory;
  customizable: boolean;
}

type ShortcutCategory = 'Recording' | 'Navigation' | 'Editing' | 'Annotation' | 'Window';

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
  onRebind?: (shortcutId: string, newKeys: string) => void;
  customBindings?: Partial<Record<string, string>>;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_ORDER: ShortcutCategory[] = ['Recording', 'Navigation', 'Editing', 'Annotation', 'Window'];

const DEFAULT_SHORTCUTS: Shortcut[] = [
  // Recording
  {
    id: 'toggle-recording',
    label: 'Start/Stop Recording',
    description: 'Toggle feedback recording session',
    keys: 'CmdOrCtrl+Shift+F',
    category: 'Recording',
    customizable: true,
  },
  {
    id: 'manual-screenshot',
    label: 'Take Screenshot',
    description: 'Capture current screen immediately',
    keys: 'CmdOrCtrl+Shift+S',
    category: 'Recording',
    customizable: true,
  },
  {
    id: 'pause-resume',
    label: 'Pause/Resume',
    description: 'Temporarily pause recording',
    keys: 'CmdOrCtrl+Shift+P',
    category: 'Recording',
    customizable: true,
  },

  // Navigation
  {
    id: 'open-settings',
    label: 'Open Settings',
    description: 'Open preferences panel',
    keys: 'CmdOrCtrl+,',
    category: 'Navigation',
    customizable: false,
  },
  {
    id: 'open-history',
    label: 'Session History',
    description: 'View past recording sessions',
    keys: 'CmdOrCtrl+H',
    category: 'Navigation',
    customizable: false,
  },
  {
    id: 'show-shortcuts',
    label: 'Keyboard Shortcuts',
    description: 'Show this panel',
    keys: 'CmdOrCtrl+/',
    category: 'Navigation',
    customizable: false,
  },
  {
    id: 'close-dialog',
    label: 'Close Dialog',
    description: 'Close current modal or panel',
    keys: 'Escape',
    category: 'Navigation',
    customizable: false,
  },

  // Editing
  {
    id: 'delete-item',
    label: 'Delete Selected',
    description: 'Remove selected feedback item',
    keys: 'Backspace',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'edit-item',
    label: 'Edit Item',
    description: 'Open item for editing',
    keys: 'Enter',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'move-up',
    label: 'Move Up',
    description: 'Move item up in list',
    keys: 'CmdOrCtrl+Up',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'move-down',
    label: 'Move Down',
    description: 'Move item down in list',
    keys: 'CmdOrCtrl+Down',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'undo',
    label: 'Undo',
    description: 'Undo last action',
    keys: 'CmdOrCtrl+Z',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'redo',
    label: 'Redo',
    description: 'Redo undone action',
    keys: 'CmdOrCtrl+Shift+Z',
    category: 'Editing',
    customizable: false,
  },
  {
    id: 'select-all',
    label: 'Select All',
    description: 'Select all items',
    keys: 'CmdOrCtrl+A',
    category: 'Editing',
    customizable: false,
  },

  // Annotation Tools
  {
    id: 'tool-arrow',
    label: 'Arrow Tool',
    description: 'Draw arrows to highlight',
    keys: '1',
    category: 'Annotation',
    customizable: false,
  },
  {
    id: 'tool-circle',
    label: 'Circle Tool',
    description: 'Draw circles to highlight',
    keys: '2',
    category: 'Annotation',
    customizable: false,
  },
  {
    id: 'tool-rectangle',
    label: 'Rectangle Tool',
    description: 'Draw rectangles to highlight',
    keys: '3',
    category: 'Annotation',
    customizable: false,
  },
  {
    id: 'tool-freehand',
    label: 'Freehand Tool',
    description: 'Draw freeform annotations',
    keys: '4',
    category: 'Annotation',
    customizable: false,
  },
  {
    id: 'tool-text',
    label: 'Text Tool',
    description: 'Add text annotations',
    keys: '5',
    category: 'Annotation',
    customizable: false,
  },
  {
    id: 'clear-annotations',
    label: 'Clear Annotations',
    description: 'Remove all annotations from current item',
    keys: 'CmdOrCtrl+Backspace',
    category: 'Annotation',
    customizable: false,
  },

  // Window
  {
    id: 'minimize-window',
    label: 'Minimize',
    description: 'Minimize to dock',
    keys: 'CmdOrCtrl+M',
    category: 'Window',
    customizable: false,
  },
  {
    id: 'quit-app',
    label: 'Quit',
    description: 'Exit MarkuprX',
    keys: 'CmdOrCtrl+Q',
    category: 'Window',
    customizable: false,
  },
];

// Key symbols for display
const KEY_SYMBOLS: Record<string, string> = {
  CmdOrCtrl: '',  // Handled separately
  Cmd: '\u2318',   // ⌘
  Ctrl: '',        // Handled separately
  Control: '',     // Handled separately
  Shift: '\u21E7', // ⇧
  Alt: '\u2325',   // ⌥
  Option: '\u2325',
  Backspace: '\u232B', // ⌫
  Delete: '\u2326',    // ⌦
  Enter: '\u23CE',     // ⏎
  Return: '\u23CE',
  Escape: 'Esc',
  Tab: '\u21E5',       // ⇥
  Up: '\u2191',        // ↑
  Down: '\u2193',      // ↓
  Left: '\u2190',      // ←
  Right: '\u2192',     // →
  Space: 'Space',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Detect if running on macOS
 */
function isMacOS(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
}

/**
 * Format key combination for display
 */
function formatKeys(keys: string, isMac: boolean): string[] {
  const parts = keys.split('+');

  return parts.map(part => {
    const trimmed = part.trim();

    // Handle CmdOrCtrl specially
    if (trimmed === 'CmdOrCtrl' || trimmed === 'CommandOrControl') {
      return isMac ? '\u2318' : 'Ctrl';
    }

    // Handle Cmd/Ctrl
    if (trimmed === 'Cmd' || trimmed === 'Command') {
      return isMac ? '\u2318' : 'Ctrl';
    }
    if (trimmed === 'Ctrl' || trimmed === 'Control') {
      return isMac ? '\u2303' : 'Ctrl'; // ⌃ on Mac
    }

    // Check symbol map
    if (KEY_SYMBOLS[trimmed]) {
      return KEY_SYMBOLS[trimmed];
    }

    // Return as-is (capitalize single letters)
    return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
  });
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Individual key badge component
 */
function KeyBadge({ keyText }: { keyText: string }) {
  return (
    <kbd className="ff-shortcut-key">
      {keyText}
    </kbd>
  );
}

/**
 * Shortcut row component
 */
interface ShortcutRowProps {
  shortcut: Shortcut;
  isMac: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (newKeys: string) => void;
  recordedKeys: string | null;
  conflict: string | null;
}

function ShortcutRow({
  shortcut,
  isMac,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  recordedKeys,
  conflict,
}: ShortcutRowProps) {
  const keyParts = formatKeys(recordedKeys || shortcut.keys, isMac);

  return (
    <div
      className={
        'ff-shortcut-row' +
        (isEditing ? ' is-editing' : '') +
        (shortcut.customizable ? ' is-customizable' : '')
      }
      onClick={shortcut.customizable && !isEditing ? onStartEdit : undefined}
    >
      <div className="ff-shortcut-row__copy">
        <div className="ff-shortcut-row__title">
          <span className="text-white text-sm font-medium">{shortcut.label}</span>
          {shortcut.customizable && !isEditing && (
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              click to edit
            </span>
          )}
        </div>
        {shortcut.description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{shortcut.description}</p>
        )}
        {isEditing && conflict && (
          <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0l6 11H0L6 0zm0 4.5v3m0 1.5v1" />
            </svg>
            Conflicts with: {conflict}
          </p>
        )}
      </div>

      <div className="ff-shortcut-row__controls">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-700 rounded border border-gray-600 min-w-[80px]">
              {recordedKeys ? (
                keyParts.map((key, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-gray-500 text-xs">+</span>}
                    <KeyBadge keyText={key} />
                  </React.Fragment>
                ))
              ) : (
                <span className="text-gray-400 text-xs animate-pulse">Press keys...</span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelEdit();
              }}
              className="p-1 text-gray-400 hover:text-white"
              title="Cancel"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {recordedKeys && !conflict && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveEdit(recordedKeys);
                }}
                className="p-1 text-green-400 hover:text-green-300"
                title="Save"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          keyParts.map((key, i) => (
            <KeyBadge key={i} keyText={key} />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function KeyboardShortcuts({
  isOpen,
  onClose,
  onRebind,
  customBindings = {},
}: KeyboardShortcutsProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMac = useMemo(() => isMacOS(), []);

  // Merge default shortcuts with custom bindings
  const shortcuts = useMemo(() => {
    return DEFAULT_SHORTCUTS.map(shortcut => ({
      ...shortcut,
      keys: customBindings[shortcut.id] || shortcut.keys,
    }));
  }, [customBindings]);

  // Filter shortcuts by search
  const filteredShortcuts = useMemo(() => {
    if (!search.trim()) return shortcuts;

    const searchLower = search.toLowerCase();
    return shortcuts.filter(s =>
      s.label.toLowerCase().includes(searchLower) ||
      s.category.toLowerCase().includes(searchLower) ||
      (s.description?.toLowerCase().includes(searchLower))
    );
  }, [shortcuts, search]);

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<ShortcutCategory, Shortcut[]> = {
      Recording: [],
      Navigation: [],
      Editing: [],
      Annotation: [],
      Window: [],
    };

    filteredShortcuts.forEach(shortcut => {
      groups[shortcut.category].push(shortcut);
    });

    return groups;
  }, [filteredShortcuts]);

  // Check for key conflicts
  const checkConflict = useCallback((newKeys: string, excludeId: string): string | null => {
    const conflict = shortcuts.find(s =>
      s.id !== excludeId &&
      s.keys.toLowerCase() === newKeys.toLowerCase()
    );
    return conflict?.label || null;
  }, [shortcuts]);

  // Handle key recording for rebinding
  useEffect(() => {
    if (!editingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Build key combination
      const parts: string[] = [];

      if (e.metaKey || e.ctrlKey) {
        parts.push('CmdOrCtrl');
      }
      if (e.shiftKey) {
        parts.push('Shift');
      }
      if (e.altKey) {
        parts.push('Alt');
      }

      // Add the actual key
      const key = e.key;
      if (!['Meta', 'Control', 'Shift', 'Alt'].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      }

      if (parts.length > 0 && !['Meta', 'Control', 'Shift', 'Alt'].includes(key)) {
        const newKeys = parts.join('+');
        setRecordedKeys(newKeys);
        setConflict(checkConflict(newKeys, editingId));
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editingId, checkConflict]);

  // Handle escape to close or cancel editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) {
          setEditingId(null);
          setRecordedKeys(null);
          setConflict(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen && !editingId) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingId, onClose]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow animation
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Reset state on close
      setSearch('');
      setEditingId(null);
      setRecordedKeys(null);
      setConflict(null);
    }
  }, [isOpen]);

  // Handlers
  const handleStartEdit = (id: string) => {
    setEditingId(id);
    setRecordedKeys(null);
    setConflict(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setRecordedKeys(null);
    setConflict(null);
  };

  const handleSaveEdit = (shortcutId: string, newKeys: string) => {
    if (onRebind && !conflict) {
      onRebind(shortcutId, newKeys);
    }
    setEditingId(null);
    setRecordedKeys(null);
    setConflict(null);
  };

  if (!isOpen) return null;

  return (
    <PortraitSurface
      title="Keyboard Shortcuts"
      titleId="shortcuts-title"
      backLabel="Back to MarkuprX"
      onBack={onClose}
      subtitle="Select a customizable shortcut to rebind it"
      contentLabel="Keyboard shortcuts"
    >
      <div className="ff-shortcuts">
        <div className="ff-shortcuts__search">
          <label className="sr-only" htmlFor="markuprx-shortcut-search">
            Search shortcuts
          </label>
          <input
            id="markuprx-shortcut-search"
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shortcuts..."
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                searchInputRef.current?.focus();
              }}
              aria-label="Clear shortcut search"
            >
              Clear
            </button>
          )}
        </div>
        <div className="ff-shortcuts__groups">
          {filteredShortcuts.length === 0 ? (
            <p className="ff-shortcuts__empty" role="status">
              No shortcuts match &ldquo;{search}&rdquo;
            </p>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const categoryShortcuts = groupedShortcuts[category];
              if (categoryShortcuts.length === 0) return null;
              const headingId = 'markuprx-shortcuts-' + category.toLowerCase();
              return (
                <section
                  key={category}
                  className="ff-shortcuts__group"
                  aria-labelledby={headingId}
                >
                  <h2 id={headingId}>{category}</h2>
                  <div className="ff-shortcuts__rows">
                    {categoryShortcuts.map((shortcut) => (
                      <ShortcutRow
                        key={shortcut.id}
                        shortcut={shortcut}
                        isMac={isMac}
                        isEditing={editingId === shortcut.id}
                        onStartEdit={() => handleStartEdit(shortcut.id)}
                        onCancelEdit={handleCancelEdit}
                        onSaveEdit={(newKeys) => handleSaveEdit(shortcut.id, newKeys)}
                        recordedKeys={editingId === shortcut.id ? recordedKeys : null}
                        conflict={editingId === shortcut.id ? conflict : null}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </PortraitSurface>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default KeyboardShortcuts;
export type { KeyboardShortcutsProps, Shortcut, ShortcutCategory };
