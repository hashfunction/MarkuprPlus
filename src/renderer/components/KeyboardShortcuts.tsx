/**
 * MarkuprX Keyboard Shortcuts Panel
 *
 * A comprehensive cheatsheet and customization interface featuring:
 * - Organized shortcuts by category (Recording, Navigation, Editing, Annotation)
 * - Real-time search/filter functionality
 * - Platform-aware display (Cmd on macOS, Ctrl on Windows)
 * - Click-to-rebind with conflict detection (for customizable shortcuts)
 * - Accessible modal with keyboard navigation
 *
 * Design: Follows macOS keyboard shortcut panel conventions
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

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

const CATEGORY_ICONS: Record<ShortcutCategory, React.ReactNode> = {
  Recording: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
    </svg>
  ),
  Navigation: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 5l3-3 3 3M5 11l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Editing: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M11.5 2.5l2 2M2 14l1-4L12.5 .5l2 2L5 12l-4 1 1 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Annotation: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 11l3-8 3 8M3.5 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 6v6M10 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Window: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="6" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="8" cy="4.5" r="0.5" fill="currentColor" />
    </svg>
  ),
};

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
  const isSymbol = keyText.length === 1 && /[\u2300-\u23FF\u2190-\u21FF]/.test(keyText);

  return (
    <kbd
      className={`
        inline-flex items-center justify-center
        min-w-[24px] h-6 px-1.5
        bg-gray-800 border border-gray-600 rounded
        font-mono text-xs text-gray-200
        shadow-[0_1px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
        ${isSymbol ? 'text-sm' : ''}
      `}
    >
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
      className={`
        flex items-center justify-between py-2.5 px-3 rounded-lg
        transition-colors duration-150
        ${isEditing
          ? 'bg-blue-500/20 ring-1 ring-blue-500/50'
          : 'hover:bg-gray-800/50'
        }
        ${shortcut.customizable ? 'cursor-pointer' : ''}
      `}
      onClick={shortcut.customizable && !isEditing ? onStartEdit : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
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

      <div className="flex items-center gap-1.5 ml-3">
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
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="
          bg-gray-900 border border-gray-700 rounded-2xl
          w-full max-w-2xl mx-4
          max-h-[80vh] overflow-hidden
          flex flex-col
          shadow-2xl shadow-black/50
          animate-in fade-in zoom-in-95 duration-200
        "
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-white">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-800">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              className="
                w-full bg-gray-800 text-white text-sm
                pl-10 pr-4 py-2 rounded-lg
                border border-gray-700
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
                focus:outline-none
                placeholder:text-gray-500
                transition-colors
              "
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {filteredShortcuts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No shortcuts match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            CATEGORY_ORDER.map(category => {
              const categoryShortcuts = groupedShortcuts[category];
              if (categoryShortcuts.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    <span className="text-gray-500">{CATEGORY_ICONS[category]}</span>
                    {category}
                  </h3>
                  <div className="space-y-0.5">
                    {categoryShortcuts.map(shortcut => (
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
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 border border-gray-700">
                {isMac ? '\u2318' : 'Ctrl'}+/
              </kbd>{' '}
              anytime to show this panel
            </span>
            <span className="flex items-center gap-1">
              {filteredShortcuts.filter(s => s.customizable).length > 0 && (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500/50"></span>
                  Click customizable shortcuts to rebind
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default KeyboardShortcuts;
export type { KeyboardShortcutsProps, Shortcut, ShortcutCategory };
