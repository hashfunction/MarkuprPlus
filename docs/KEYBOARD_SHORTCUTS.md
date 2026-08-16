# Keyboard Shortcuts Reference

markuprx uses keyboard shortcuts for efficient workflows. This guide covers all available shortcuts and how to customize them.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Recording Shortcuts](#recording-shortcuts)
- [Navigation Shortcuts](#navigation-shortcuts)
- [Editing Shortcuts](#editing-shortcuts)
- [Annotation Shortcuts](#annotation-shortcuts)
- [Window Shortcuts](#window-shortcuts)
- [Customization](#customization)
- [Platform Differences](#platform-differences)
- [Troubleshooting](#troubleshooting)

## Quick Reference

### Global Hotkeys (work from any application)

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Start/Stop Recording | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Manual Screenshot | `Cmd+Shift+S` | `Ctrl+Shift+S` |

### In-App Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Settings | `Cmd+,` | `Ctrl+,` |
| Keyboard Shortcuts Panel | `Cmd+/` | `Ctrl+/` |
| Close Dialog | `Escape` | `Escape` |
| Quit | `Cmd+Q` | `Alt+F4` |

## Recording Shortcuts

### Start/Stop Recording
**Default**: `Cmd+Shift+F` (macOS) / `Ctrl+Shift+F` (Windows)

This is the primary shortcut that:
- Starts a new recording session when idle
- Shows the desktop selector in Window mode on first press
- Stops recording and saves when recording

**Customizable**: Yes (Settings > Hotkeys)

### Manual Screenshot
**Default**: `Cmd+Shift+S` (macOS) / `Ctrl+Shift+S` (Windows)

Captures a screenshot immediately during recording, bypassing the voice pause detection. Useful for:
- Capturing specific moments
- Screenshots during continuous speech
- Precise timing control

**Customizable**: Yes (Settings > Hotkeys)

### Pause/Resume Recording
**Default**: `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P` (Windows)

Temporarily pauses the recording session:
- Audio capture continues (for recovery buffer)
- Screenshots are not captured
- Transcription is paused

Press again to resume recording.

**Customizable**: Not currently

## Navigation Shortcuts

### Open Settings
**Shortcut**: `Cmd+,` (macOS) / `Ctrl+,` (Windows)

Opens the Settings panel.

### Session History
**Shortcut**: `Cmd+H` (macOS) / `Ctrl+H` (Windows)

Opens the Session History browser to view past recordings.

### Keyboard Shortcuts Panel
**Shortcut**: `Cmd+/` (macOS) / `Ctrl+/` (Windows)

Opens this keyboard shortcuts reference panel within the app.

### Close Dialog/Panel
**Shortcut**: `Escape`

Closes the current dialog, panel, or modal:
- Settings panel
- Window selector
- Session review
- Export dialog
- Any modal

### Minimize Window
**Shortcut**: `Cmd+M` (macOS)

Minimizes the markuprx window to the dock.

### Quit Application
**Shortcut**: `Cmd+Q` (macOS) / `Alt+F4` (Windows)

Completely quits markuprx:
- Stops any active recording
- Saves session state for crash recovery
- Removes tray icon

## Editing Shortcuts

These shortcuts work in the Session Review panel.

### Delete Selected Item
**Shortcut**: `Backspace` (macOS) / `Delete` (Windows)

Deletes the currently selected feedback item.

### Edit Item
**Shortcut**: `Enter` or `Return`

Opens the selected item for inline editing of:
- Transcription text
- Annotations

### Move Item Up
**Shortcut**: `Cmd+Up` (macOS) / `Ctrl+Up` (Windows)

Moves the selected item up in the list, changing its order in the export.

### Move Item Down
**Shortcut**: `Cmd+Down` (macOS) / `Ctrl+Down` (Windows)

Moves the selected item down in the list.

### Undo
**Shortcut**: `Cmd+Z` (macOS) / `Ctrl+Z` (Windows)

Undoes the last action:
- Deletion
- Reorder
- Text edit
- Annotation

### Redo
**Shortcut**: `Cmd+Shift+Z` (macOS) / `Ctrl+Shift+Z` or `Ctrl+Y` (Windows)

Redoes the last undone action.

### Select All
**Shortcut**: `Cmd+A` (macOS) / `Ctrl+A` (Windows)

Selects all feedback items in the current session.

## Annotation Shortcuts

### Capture Selection

These keys work while choosing what to record:

| Action | Shortcut |
|--------|----------|
| Select application windows | `W` |
| Drag an arbitrary region | `R` |
| Select an entire display | `S` |
| Cancel selection | `Escape` |

### Live Recording Annotations

Choose **Draw** in the recording HUD first. While the protected drawing surface is active:

| Action | Shortcut |
|--------|----------|
| Undo the last completed stroke | `Cmd+Z` / `Ctrl+Z` |
| Return to application interaction | `Escape` |

Pen, circle, highlighter, colors, Clear, and Done are available in the live toolbar. Drawing is disabled while recording is paused. The toolbar is excluded from the recording; the marker and strokes are burned into the saved video and extracted report frames.

### Review Annotations

These shortcuts work when an item is selected for annotation.

### Tool Selection

| Tool | Shortcut | Description |
|------|----------|-------------|
| Arrow | `1` | Draw arrows to highlight areas |
| Circle | `2` | Draw circles around elements |
| Rectangle | `3` | Draw rectangles to box areas |
| Freehand | `4` | Draw freeform lines |
| Text | `5` | Add text labels |

### Clear All Annotations
**Shortcut**: `Cmd+Backspace` (macOS) / `Ctrl+Backspace` (Windows)

Removes all annotations from the current screenshot.

### Annotation Colors
While annotating:
- `Shift+1` through `Shift+5`: Quick color selection
- Or use the color picker in the annotation toolbar

## Window Shortcuts

### Minimize
**Shortcut**: `Cmd+M` (macOS)

Minimizes to the dock.

### Hide Application
**Shortcut**: `Cmd+H` (macOS)

Hides all markuprx windows (app stays running in tray).

### Close Window
**Shortcut**: `Cmd+W` (macOS) / `Ctrl+W` (Windows)

Closes the current window (app stays running in tray on macOS).

## Customization

### How to Customize Hotkeys

1. Open Settings (`Cmd+,` or `Ctrl+,`)
2. Navigate to the **Hotkeys** tab
3. Click on the shortcut field you want to change
4. Press your desired key combination
5. The shortcut saves automatically

### Recording a New Shortcut

When the shortcut field is active:
1. Press your modifier keys (Cmd, Shift, Alt, Ctrl)
2. Press the letter or function key
3. The combination is displayed
4. Press Escape to cancel

### Conflict Detection

markuprx automatically detects conflicts:
- **Internal conflicts**: Another markuprx shortcut uses the same keys
- **System conflicts**: Known system shortcuts (may not catch all)

If a conflict is detected:
- A warning message appears
- You can still save the shortcut
- The conflicting shortcut will not work

### Supported Key Combinations

**Modifiers**:
- `Cmd` / `Command` (macOS)
- `Ctrl` / `Control` (Windows/Linux)
- `Shift`
- `Alt` / `Option`

**Keys**:
- Letters: A-Z
- Numbers: 0-9
- Function keys: F1-F12
- Special: Backspace, Delete, Enter, Escape, Tab
- Arrows: Up, Down, Left, Right

**Recommended patterns**:
- `Cmd/Ctrl + Shift + Letter` - Most reliable
- `Cmd/Ctrl + Alt + Letter` - Good alternative
- Avoid using just `Cmd/Ctrl + Letter` (conflicts with common shortcuts)

## Platform Differences

### macOS

| Key | Symbol |
|-----|--------|
| Command | &#8984; |
| Shift | &#8679; |
| Option/Alt | &#8997; |
| Control | &#8963; |
| Return | &#9166; |
| Delete | &#9003; |

### Windows/Linux

Uses text labels instead of symbols:
- `Ctrl` instead of &#8963;
- `Shift` instead of &#8679;
- `Alt` instead of &#8997;

### Key Differences

| Action | macOS | Windows |
|--------|-------|---------|
| Quit App | `Cmd+Q` | `Alt+F4` |
| Delete | `Backspace` or `Delete` | `Delete` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Y` |
| Settings | `Cmd+,` | `Ctrl+,` |

## Troubleshooting

### Shortcuts Not Working

**Check global shortcut registration**:
1. Look for the tray icon indicator
2. If no icon, markuprx may not have registered hotkeys
3. Restart markuprx

**Check permissions (macOS)**:
1. System Preferences > Security & Privacy > Accessibility
2. Ensure markuprx is checked
3. Restart markuprx if you made changes

**Check for conflicts**:
1. Another app may be capturing the shortcut first
2. Try changing to a different shortcut
3. Common conflicts: screenshot tools, window managers

### Shortcuts Work in Some Apps But Not Others

Some applications capture keyboard input before system hotkeys:
- Full-screen games
- Virtual machines
- Some IDEs (VS Code, IntelliJ)

**Solutions**:
- Use a different shortcut
- Exit full-screen mode
- Check app-specific shortcut settings

### Resetting Shortcuts

To reset all shortcuts to defaults:
1. Open Settings > Hotkeys
2. Click the reset icon (circular arrow) in the section header
3. Confirm the reset

Or reset individual shortcuts by:
1. Click the shortcut field
2. Press the default key combination
3. Save

### Hotkey Not Registering

If a hotkey doesn't appear after pressing keys:
- Make sure you're pressing at least one modifier key
- Some keys cannot be used as hotkeys (Fn, media keys)
- Try pressing keys more slowly

### Finding Conflicting Applications

To identify what's capturing your shortcut:
1. Quit applications one by one
2. Test the shortcut after each
3. The conflict is with the last-quit app

Common culprits:
- Screenshot tools (Snagit, CleanShot)
- Clipboard managers (Alfred, Paste)
- Window managers (Magnet, Rectangle)
- System utilities (BetterTouchTool)
