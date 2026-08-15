# Getting Started with markupR

This guide walks you through setting up markupR for the first time.

## Table of Contents

- [System Requirements](#system-requirements)
- [Installation](#installation)
- [First-Time Setup](#first-time-setup)
- [Configuring BYOK API Keys (Optional)](#configuring-byok-api-keys-optional)
- [Granting Permissions](#granting-permissions)
- [Your First Recording](#your-first-recording)

## System Requirements

### macOS
- macOS 10.15 (Catalina) or later
- Apple Silicon or Intel processor
- 4 GB RAM minimum
- 100 MB disk space

### Windows
- Windows 10 or later
- x64 processor
- 4 GB RAM minimum
- 100 MB disk space

### Linux
- Ubuntu 18.04+ or equivalent
- x64 processor
- 4 GB RAM minimum
- 100 MB disk space

## Installation

### macOS

1. Download the latest `.dmg` file from the [releases page](https://github.com/eddiesanjuan/markupr/releases)
2. Open the downloaded DMG file
3. Drag the markupR icon to your Applications folder
4. Eject the DMG
5. Open markupR from your Applications folder

**Note**: On first launch, macOS may show a security warning. Click "Open" to continue, or go to System Preferences > Security & Privacy to allow the app.

### Windows

1. Download the latest `.exe` installer from the [releases page](https://github.com/eddiesanjuan/markupr/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch markupR from the Start menu or desktop shortcut

### Linux

**AppImage:**
```bash
# Download the AppImage
wget https://github.com/eddiesanjuan/markupr/releases/latest/download/markupr.AppImage

# Make it executable
chmod +x markupr.AppImage

# Run
./markupr.AppImage
```

**Debian/Ubuntu:**
```bash
# Download and install
wget https://github.com/eddiesanjuan/markupr/releases/latest/download/markupr.deb
sudo dpkg -i markupr.deb
sudo apt-get install -f  # Install dependencies if needed
```

## First-Time Setup

When you launch markupR for the first time, the onboarding wizard will guide you through:

1. **Welcome** - Introduction to markupR
2. **Permissions** - Granting required system permissions
3. **BYOK Keys (Optional)** - Configuring OpenAI + Anthropic keys for full AI-assisted reports
4. **Quick Tour** - Learning the basic workflow

You can skip the wizard and configure settings manually, but we recommend completing it.

## Configuring BYOK API Keys (Optional)

markupR can run local-first, and you can optionally configure BYOK keys for full cloud-assisted transcription + analysis.

### Which keys do I need?

- **OpenAI key**: used for BYOK transcription workflows
- **Anthropic key**: used for BYOK AI analysis workflows

If you only want capture + basic local workflows, you can start without keys and add them later.

### Create your keys

1. OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Anthropic: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
3. Create keys and copy them immediately (you may not be able to view them again).

### Add keys in markupR

1. Open markupR
2. Go to **Settings** (`Cmd+,` on macOS, `Ctrl+,` on Windows)
3. Navigate to **Advanced**
4. Paste your OpenAI and Anthropic keys in their respective fields
5. Click **Test Connection** for each key
6. Confirm each shows **API key verified and saved securely**

## Granting Permissions

markupR requires certain system permissions to function properly.

### macOS Permissions

#### Microphone Access

markupR needs microphone access to capture your voice narration.

1. When prompted, click **OK** to allow microphone access
2. If you denied access, go to:
   - System Preferences > Security & Privacy > Privacy > Microphone
   - Check the box next to markupR

#### Screen Recording

markupR needs screen recording permission to record the selected window, region, or display and extract report frames.

1. When prompted, click **Open System Preferences**
2. Go to Security & Privacy > Privacy > Screen Recording
3. Check the box next to markupR
4. **Restart markupR** for the change to take effect

#### Accessibility (Optional)

For global hotkeys to work in all applications:

1. Go to System Preferences > Security & Privacy > Privacy > Accessibility
2. Click the lock icon and enter your password
3. Check the box next to markupR

### Windows Permissions

Windows typically handles permissions automatically. If you encounter issues:

1. Right-click on markupR in the Start menu
2. Select "Run as administrator" (for first run only)
3. Follow any Windows Security prompts

### Linux Permissions

Depending on your distribution, you may need to:

```bash
# Add your user to the audio group for microphone access
sudo usermod -a -G audio $USER

# Log out and log back in for changes to take effect
```

## Your First Recording

Now that everything is set up, let's capture your first feedback!

### Step 1: Start Recording

Press the global hotkey:
- **macOS**: `Cmd+Shift+F`
- **Windows/Linux**: `Ctrl+Shift+F`

### Step 2: Select What to Record

A QuickTime-style desktop selector appears. **Window** mode is the default:

- Move over an application window to highlight its exact bounds, then click it to record only that application.
- Choose **Region** (or press `R`) and drag any area at least 32 × 32 pixels.
- Choose **Full Screen** (or press `S`) only when you explicitly want an entire display.
- Press `W` to return to Window mode or `Escape` to cancel without starting a session.

On window systems that do not expose trustworthy window geometry, markupR offers an exact-source thumbnail gallery instead of guessing. That exact window can still be recorded, but live drawing is disabled because markupR will not fabricate annotation bounds. Region and Full Screen remain available when the display can be matched to its exact capture source.

### Step 3: Reproduce and Narrate

Start speaking! Some tips:
- Speak naturally and clearly
- Keep the pointer over the recorded area to show its red marker halo in the video
- Use the recording HUD to confirm microphone activity

### Step 4: Draw Over the Recording

Choose **Draw** in the recording HUD to annotate the recorded area while you talk. The protected toolbar offers:

- Pen, circle, and translucent highlighter tools
- Red, yellow, green, and blue
- Undo and Clear
- **Done** or `Escape` to return control to the recorded application

The toolbar itself is excluded from capture. The marker and drawings are composited into the saved video. Finishing a stroke also marks that moment for report-frame extraction.

You can still press `Cmd+Shift+S` (or `Ctrl+Shift+S`) to place a manual report-frame cue.

### Step 5: Stop Recording

Press the hotkey again (`Cmd+Shift+F` or `Ctrl+Shift+F`) to stop.

### Step 6: Review and Export

After stopping:
1. The Session Review panel opens
2. Review your feedback items and extracted frames; completed annotations appear in the video and annotated report frames
3. Edit or delete items as needed
4. Click **Copy to Clipboard** or choose an export format

### Step 7: Use Your Feedback

Paste the copied feedback into your AI assistant:
- Claude
- ChatGPT
- Cursor
- GitHub Copilot

The Markdown format is optimized for AI consumption.

## Next Steps

- [Configure settings](CONFIGURATION.md) to customize markupR
- [Learn keyboard shortcuts](KEYBOARD_SHORTCUTS.md) for efficient workflows
- [Explore export formats](EXPORT_FORMATS.md) for different use cases

## Troubleshooting

Having issues? Check our [Troubleshooting Guide](TROUBLESHOOTING.md) for common solutions.
