# Troubleshooting Guide

> **Upgrading to MarkuprX 3.0:** the new application and bundle identity may cause macOS or Windows to request Screen Recording, Microphone, or Accessibility permission again. Re-enable MarkuprX in the relevant privacy panels, then restart the app once.

This guide helps resolve common issues with markuprx.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Permission Issues](#permission-issues)
- [Audio Issues](#audio-issues)
- [Transcription Issues](#transcription-issues)
- [Screenshot Issues](#screenshot-issues)
- [Hotkey Issues](#hotkey-issues)
- [Export Issues](#export-issues)
- [Performance Issues](#performance-issues)
- [Getting Help](#getting-help)

## Installation Issues

### macOS: "markuprx" cannot be opened because it is from an unidentified developer

**Solution**:
1. Right-click (or Control-click) the app in Applications
2. Select "Open" from the context menu
3. Click "Open" in the dialog that appears
4. The app will be saved as an exception

Or via System Preferences:
1. Open System Preferences > Security & Privacy > General
2. Click "Open Anyway" next to the blocked app message
3. Click "Open" in the confirmation dialog

### macOS: "markuprx" is damaged and can't be opened

This usually means the app's code signature was invalidated.

**Solution**:
```bash
# Remove quarantine attribute
xattr -cr /Applications/markuprx.app

# Then try opening again
open /Applications/markuprx.app
```

### Windows: SmartScreen Warning

**Solution**:
1. Click "More info" on the SmartScreen dialog
2. Click "Run anyway"
3. The app will run normally

### Windows: Installation fails with error code

**Common causes**:
- Antivirus blocking installation
- Insufficient disk space
- Running installer from network drive

**Solutions**:
1. Temporarily disable antivirus
2. Clear temp folder: `%TEMP%`
3. Run installer as Administrator
4. Download installer to local drive first

## Permission Issues

### macOS: Microphone Permission

**Symptom**: No audio captured, "Microphone access denied" error

**Solution**:
1. Open System Preferences > Security & Privacy > Privacy
2. Click Microphone in the sidebar
3. Find markuprx and check the box
4. Restart markuprx

**If markuprx isn't listed**:
1. Click the lock icon and authenticate
2. Click the "+" button
3. Navigate to /Applications and select markuprx
4. Click Open

### macOS: Screen Recording Permission

**Symptom**: Black screenshots, "Screen recording not permitted"

**Solution**:
1. Open System Preferences > Security & Privacy > Privacy
2. Click Screen Recording in the sidebar
3. Find markuprx and check the box
4. **Restart markuprx** (required for screen recording)

**If permission was previously granted but not working**:
1. Uncheck markuprx
2. Quit markuprx completely
3. Re-check markuprx
4. Restart markuprx

### macOS: Accessibility Permission

**Symptom**: Global hotkeys not working in all apps

**Solution**:
1. Open System Preferences > Security & Privacy > Privacy
2. Click Accessibility in the sidebar
3. Find markuprx and check the box

### Windows: Microphone Access

**Symptom**: No audio input

**Solution**:
1. Open Settings > Privacy > Microphone
2. Ensure "Allow apps to access your microphone" is On
3. Scroll down and ensure markuprx has access

## Audio Issues

### No Audio Detected

**Symptoms**:
- Waveform shows no activity
- "No audio input" message
- Transcription is empty

**Checklist**:
1. **Check permissions** (see above)
2. **Check microphone hardware**:
   - Test in other apps (Voice Memos, etc.)
   - Check microphone is plugged in/enabled
3. **Check audio device selection**:
   - Open Settings > Recording > Microphone
   - Select the correct input device
4. **Check system volume**:
   - Ensure input volume isn't muted
   - macOS: System Preferences > Sound > Input
   - Windows: Settings > Sound > Input

### Wrong Microphone Selected

**Solution**:
1. Open markuprx Settings (`Cmd+,` or `Ctrl+,`)
2. Go to Recording tab
3. Select correct microphone from dropdown
4. Test by speaking - waveform should respond

### Audio is Distorted or Clipping

**Symptom**: Transcription is garbled, audio sounds bad

**Solutions**:
1. Move microphone away from mouth
2. Lower microphone input gain:
   - macOS: System Preferences > Sound > Input
   - Windows: Settings > Sound > Input device properties
3. Use a lower quality microphone setting

### Bluetooth Audio Issues

**Symptom**: Audio cuts out, delays, or doesn't work with Bluetooth headset

**Solutions**:
1. Use wired microphone if possible
2. Disconnect and reconnect Bluetooth device
3. Set Bluetooth device as default in system settings
4. Check Bluetooth device battery level

## Transcription Issues

### OpenAI Connection Failed

**Symptom**: "Connection failed", "API error", no transcription

**Checklist**:
1. **Verify API key**:
   - Check key is entered correctly (no extra spaces)
   - Try re-entering the key
   - Test with "Test Connection" button
2. **Check internet connection**:
   - Test other websites
   - Check firewall isn't blocking OpenAI
3. **Check OpenAI account**:
   - Log in to platform.openai.com/api-keys
   - Verify account has available credits
   - Check API key permissions

### Poor Transcription Quality

**Symptoms**: Many errors, wrong words, low confidence

**Solutions**:
1. **Improve audio quality**:
   - Use better microphone
   - Reduce background noise
   - Speak closer to microphone
2. **Speak clearly**:
   - Moderate pace
   - Clear enunciation
   - Avoid mumbling
3. **Check language setting**:
   - Settings > Advanced > Language
   - Ensure matches your spoken language

### Transcription Lag

**Symptom**: Text appears several seconds after speaking

**Causes**:
- Network latency
- CPU overload

**Solutions**:
1. Check internet speed
2. Close other applications
3. Restart markuprx

### API Key "Invalid" Error

**Solutions**:
1. Generate a new API key at platform.openai.com/api-keys
2. Ensure key has "Usage" permission
3. Copy key carefully (no extra characters)
4. Paste in Settings > Advanced > API Key
5. Click "Test Connection"

## Screenshot Issues

### Black Screenshots

**Symptom**: All screenshots are solid black

**Causes**:
- Screen recording permission not granted
- DRM-protected content (Netflix, etc.)
- GPU/driver issues

**Solutions**:
1. **Grant screen recording permission** (macOS)
2. **Avoid DRM content**: Some streaming services block capture
3. **Update graphics drivers** (Windows)
4. **Disable hardware acceleration**: Settings > Advanced > Debug Mode

### Wrong Monitor Captured

**Symptom**: Screenshots from different monitor than selected

**Solutions**:
1. Use Window Selector carefully
2. Select specific window instead of full screen
3. Check display arrangement in system settings

### Screenshots Not Capturing

**Symptom**: Screenshot count stays at 0

**Causes**:
- Voice pause threshold too high
- Not pausing long enough
- Audio issues (no voice detected)

**Solutions**:
1. Lower pause threshold: Settings > Recording > Pause Threshold
2. Pause more deliberately while speaking
3. Use manual screenshot: `Cmd+Shift+S` / `Ctrl+Shift+S`
4. Check audio is being captured (waveform active)

### Screenshots Too Frequent

**Symptom**: Too many screenshots, capturing on every pause

**Solutions**:
1. Increase pause threshold: Settings > Recording
2. Increase minimum time between captures
3. Speak more continuously

## Hotkey Issues

### Hotkey Not Working

**Symptoms**: Pressing hotkey does nothing

**Checklist**:
1. **Check permissions** (macOS Accessibility)
2. **Check for conflicts**:
   - Another app using same hotkey
   - System shortcut conflict
3. **Try different hotkey**: Settings > Hotkeys
4. **Restart markuprx**

### Hotkey Works in Some Apps Only

**Causes**:
- App captures keystrokes before system (games, VMs)
- App has same hotkey defined

**Solutions**:
1. Change markuprx hotkey
2. Check app's shortcut settings
3. Exit full-screen mode

### Hotkey Works but Takes Long

**Symptom**: Delay between pressing hotkey and action

**Solutions**:
1. Close background applications
2. Check CPU usage
3. Restart markuprx

## Export Issues

### Export Fails

**Symptoms**: "Export failed" error, no file created

**Checklist**:
1. **Check disk space**: Ensure enough space for export
2. **Check write permissions**: Can you write to output folder?
3. **Check path**: Avoid special characters in path
4. **Try different location**: Export to Desktop first

### PDF Export Issues

**Symptoms**: PDF generation fails, images missing

**Solutions**:
1. Ensure session has screenshots
2. Try with "Include Images" disabled
3. Try smaller session (fewer items)

### Corrupted Export

**Symptom**: File opens but content is garbled

**Solutions**:
1. Re-export with different settings
2. Try different format
3. Check for disk errors

## Performance Issues

### High CPU Usage

**Symptoms**: Fan running, system slow during recording

**Causes**:
- Audio processing
- Transcription
- Screenshot capture

**Solutions**:
1. Close other applications
2. Disable audio waveform: Settings > Recording
3. Increase pause threshold (fewer screenshots)
4. Restart markuprx periodically

### High Memory Usage

**Symptom**: Memory usage grows during long sessions

**Solutions**:
1. Keep sessions under 10 minutes
2. Restart markuprx between sessions
3. Close other memory-intensive apps

### Slow Export

**Symptom**: Export takes very long

**Solutions**:
1. Use Markdown instead of PDF (faster)
2. Disable "Include Images"
3. Export fewer items at once

## Getting Help

### Collecting Debug Information

1. Enable debug mode: Settings > Advanced > Debug Mode
2. Reproduce the issue
3. Collect logs:
   - macOS: `~/Library/Logs/markuprx/`
   - Windows: `%APPDATA%\markuprx\logs\`
4. Include system info:
   - OS version
   - markuprx version (Settings footer)
   - Hardware specs

### Reporting Issues

When reporting an issue:

1. Search existing issues first
2. Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Debug logs
   - Screenshots if helpful
3. Use the bug report template

### Contact

- **Project website**: [markuprx.com](https://markuprx.com)
- **Documentation**: This documentation
- **Release Notes**: Check for known issues in release notes

### Self-Diagnosis Checklist

Before seeking help, verify:

- [ ] markuprx is up to date
- [ ] System meets requirements
- [ ] Permissions are granted
- [ ] API key is valid
- [ ] Internet connection works
- [ ] Issue persists after restart
- [ ] Issue persists after reinstall
