# Configuration Guide

This guide covers all markuprx settings and how to customize them for your workflow.

## Table of Contents

- [Accessing Settings](#accessing-settings)
- [General Settings](#general-settings)
- [Recording Settings](#recording-settings)
- [Capture Settings](#capture-settings)
- [Appearance Settings](#appearance-settings)
- [Hotkey Settings](#hotkey-settings)
- [Advanced Settings](#advanced-settings)
- [Configuration File](#configuration-file)
- [Reset to Defaults](#reset-to-defaults)

## Accessing Settings

Open the Settings panel using:
- **Keyboard**: `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux)
- **Menu**: markuprx > Preferences (macOS) or File > Settings (Windows)
- **Tray Icon**: Right-click > Settings

Settings are saved automatically when changed.

## General Settings

### Output Directory

**Default**: `~/Documents/markuprx`

Where markuprx saves your recording sessions. Each session creates a folder with:
- `feedback.md` - The Markdown document
- `screenshots/` - Captured screenshots
- `metadata.json` - Session metadata

To change:
1. Click the **Browse...** button
2. Select your preferred directory
3. The change takes effect immediately

**Tips**:
- Choose a cloud-synced folder (Dropbox, iCloud, etc.) for automatic backup
- Avoid network drives for best performance

### Launch at Login

**Default**: Off

When enabled, markuprx starts automatically when you log in to your computer.

**macOS**: Adds markuprx to Login Items
**Windows**: Creates a startup registry entry
**Linux**: Creates a `.desktop` autostart file

### Check for Updates

**Default**: On

When enabled, markuprx checks for updates on launch and notifies you when a new version is available.

Updates are never installed automatically - you always have control.

## Recording Settings

### Countdown Before Recording

**Default**: 3 seconds
**Options**: 0, 3, or 5 seconds

A countdown timer before recording begins, giving you time to:
- Position your window
- Clear your throat
- Prepare what to say

Set to 0 for immediate recording.

### Show Transcription Preview

**Default**: On

Displays a live transcription overlay during recording, showing:
- What markuprx hears
- Confidence indicators
- Last 100 characters of transcription

Disable if you find it distracting.

### Show Audio Waveform

**Default**: On

Displays a visual audio level indicator during recording, helping you:
- Confirm your microphone is working
- See when voice activity is detected
- Adjust speaking volume

## Capture Settings

### Pause Threshold

**Default**: 1500ms (1.5 seconds)
**Range**: 500ms - 3000ms

How long you must pause speaking before markuprx captures a screenshot.

**Lower values (500-1000ms)**:
- More screenshots captured
- Good for detailed feedback
- May capture unintended screenshots

**Higher values (2000-3000ms)**:
- Fewer screenshots captured
- Good for general overviews
- Requires deliberate pauses

### Minimum Time Between Captures

**Default**: 500ms
**Range**: 300ms - 2000ms

The minimum gap between automatic screenshots, preventing:
- Duplicate screenshots
- Rapid-fire captures during stuttering
- Overwhelming screenshot counts

### Image Format

**Default**: PNG
**Options**: PNG, JPEG

- **PNG**: Lossless quality, larger files, best for text/UI
- **JPEG**: Smaller files, configurable quality, good for photos

### Image Quality (JPEG only)

**Default**: 85%
**Range**: 1-100%

Higher values = better quality but larger files.

Recommended:
- **85-95%**: High quality, reasonable file size
- **70-84%**: Good balance
- **50-69%**: Smaller files, visible compression

### Maximum Image Width

**Default**: 1920px
**Range**: 800px - 2400px

Screenshots wider than this are scaled down, which:
- Reduces file size
- Maintains readability
- Works well in most documents

For 4K displays, consider increasing to 2400px.

## Appearance Settings

### Theme

**Default**: System
**Options**: Dark, Light, System

- **System**: Matches your operating system theme
- **Dark**: Always use dark theme
- **Light**: Always use light theme

### Accent Color

**Default**: Blue (#3B82F6)
**Options**: 9 presets + custom color

The accent color is used for:
- Recording indicator
- Buttons and links
- Focus states
- Progress indicators

Preset colors:
- Blue, Purple, Pink, Red, Orange
- Amber, Emerald, Teal, Cyan

Or use the custom color picker for any color.

## Hotkey Settings

### Toggle Recording

**Default**: `CommandOrControl+Shift+F`

The primary hotkey to start and stop recording sessions.

### Manual Screenshot

**Default**: `CommandOrControl+Shift+S`

Capture a screenshot immediately, regardless of voice activity.

### Customizing Hotkeys

1. Click on a hotkey field
2. Press your desired key combination
3. If there's a conflict, you'll see a warning
4. The new hotkey is saved automatically

**Supported modifiers**:
- `Cmd` (macOS) / `Ctrl` (Windows/Linux)
- `Shift`
- `Alt` / `Option`
- `Ctrl` (macOS)

**Tips**:
- Avoid common system shortcuts
- Test hotkeys in different applications
- Some applications may capture hotkeys before markuprx

### Hotkey Conflicts

If a hotkey conflicts with another application or system shortcut:
1. markuprx shows a warning
2. Try a different combination
3. Consider disabling the conflicting shortcut in the other app

## Advanced Settings

### OpenAI API Key

Your OpenAI API key for transcription. See [Getting Started](GETTING_STARTED.md) for setup instructions.

**Security**: The API key is stored securely using:
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service (libsecret)

### Debug Mode

**Default**: Off

When enabled:
- Verbose logging in DevTools console
- Additional diagnostic information
- Performance metrics

Useful for troubleshooting. Disable for normal use.

### Keep Audio Backups

**Default**: Off

When enabled, markuprx saves the raw audio from each session:
- Stored as `.wav` files in the session folder
- Useful if transcription needs correction
- Increases storage usage

## Configuration File

markuprx stores settings in a JSON file:

**macOS**: `~/Library/Application Support/markuprx/config.json`
**Windows**: `%APPDATA%\markuprx\config.json`
**Linux**: `~/.config/markuprx/config.json`

### Example Configuration

```json
{
  "outputDirectory": "/Users/you/Documents/markuprx",
  "launchAtLogin": false,
  "checkForUpdates": true,
  "defaultCountdown": 3,
  "showTranscriptionPreview": true,
  "showAudioWaveform": true,
  "pauseThreshold": 1500,
  "minTimeBetweenCaptures": 500,
  "imageFormat": "png",
  "imageQuality": 85,
  "maxImageWidth": 1920,
  "theme": "system",
  "accentColor": "#3B82F6",
  "hotkeys": {
    "toggleRecording": "CommandOrControl+Shift+F",
    "manualScreenshot": "CommandOrControl+Shift+S"
  },
  "debugMode": false,
  "keepAudioBackups": false
}
```

**Note**: Editing the config file directly is not recommended. Use the Settings UI instead.

## Reset to Defaults

### Reset a Single Section

Each settings section has a reset button (circular arrow icon) that resets only that section to defaults.

### Reset All Settings

At the bottom of the Settings panel:
1. Click **Reset All to Defaults**
2. Confirm the action

This resets all settings but:
- Does NOT delete your sessions
- Does NOT remove your API key
- Does NOT affect your output directory contents

### Complete Reset

To completely reset markuprx:

1. Quit markuprx
2. Delete the config directory:
   - macOS: `rm -rf ~/Library/Application\ Support/markuprx`
   - Windows: Delete `%APPDATA%\markuprx`
   - Linux: `rm -rf ~/.config/markuprx`
3. Relaunch markuprx

## Import/Export Settings

### Export Settings

1. Go to Settings > Advanced > Settings Management
2. Click **Export**
3. Choose a location to save `markuprx-settings.json`

### Import Settings

1. Go to Settings > Advanced > Settings Management
2. Click **Import**
3. Select a previously exported settings file
4. Settings are applied immediately

**Note**: API keys are NOT included in exports for security reasons.
