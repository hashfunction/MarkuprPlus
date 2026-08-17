# MarkuprPlus keyboard shortcuts

Open the Keyboard Shortcuts surface from the tray/taskbar or the native Help menu. Global recording shortcuts can be changed in Settings.

## Global recording shortcuts

| Action | macOS default | Windows/Linux default |
|---|---|---|
| Start/Stop recording | `Command+Shift+F` | `Ctrl+Shift+F` |
| Manual frame cue | `Command+Shift+S` | `Ctrl+Shift+S` |
| Pause/Resume | `Command+Shift+P` | `Ctrl+Shift+P` |

Pause stops active audio/recording components until resume; it does not continue a hidden recording buffer.

Global registration can fail when another application owns the same accelerator. Settings validates new values and reports conflicts. Reset restores the defaults.

## Native menu accelerators

The application menu also exposes:

- Settings: `Command+,` / `Ctrl+,`
- Session History: `Command+H` / `Ctrl+H`
- Keyboard Shortcuts: `Command+/` / `Ctrl+/`
- Open Session: `Command+O` / `Ctrl+O`
- Export: `Command+E` / `Ctrl+E`
- Quit on macOS: `Command+Q`; Exit on Windows: `Alt+F4`

These are native menu accelerators, not all configurable global hotkeys. On macOS, standard system menu roles may determine the rendered key symbols.

## Recording and annotation

After choosing a capture target:

- Hold Command on macOS or Control on Windows to activate live drawing when global modifier observation is available.
- Use the visible Draw/Done control as the accessibility/fallback path.
- Choose freehand, circle, or highlight in the annotation toolbar.
- Commit the marked issue to preserve its screenshot/context separately.
- Use the manual frame shortcut when narration alone needs a visual cue.

Releasing the modifier returns click-through interaction to the target application. The annotation layer does not claim generic undo/redo, crop, text, arrow, or blur shortcuts.

## Review Editor

When focus is on the issue-card region and not inside a button/input/menu:

| Key | Action |
|---|---|
| `Arrow Up` | Select/focus previous issue |
| `Arrow Down` | Select/focus next issue |
| `Enter` | Edit selected issue |
| `Delete` / `Backspace` | Delete selected issue after the app's confirmation behavior |
| `Escape` | Clear selection or leave edit/menu state |

Within menus, Arrow Up/Down, Home, End, Escape, Enter, and Space follow the menu's focus/activation behavior. Tab and Shift+Tab move through ordinary controls.

## Portrait surfaces

- Tab / Shift+Tab traverse interactive controls.
- Enter or Space activates buttons and tabs.
- Arrow keys navigate tab rails and menus where indicated.
- Escape closes contained dialogs/menus and returns focus to the invoking control.
- The Settings overflow button scrolls/focuses the next hidden section for mouse and keyboard users.

## Accessibility notes

Visible focus is intentional. Reduced-motion and forced-colors preferences are supported. macOS Accessibility permission is used for reliable global modifier observation during annotation, not as a requirement for ordinary menu hotkeys. If it is not granted, use the explicit Draw/Done control.

If a shortcut does not work, check the Settings conflict message, verify the app is running, and test a different combination before changing OS permissions.
