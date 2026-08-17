/**
 * PermissionManager Expanded Tests
 *
 * Extends the existing permissionManager.test.ts with:
 * - requestPermission flow
 * - showStartupPermissionDialog behavior
 * - openSystemPreferences URL construction
 * - getPermissionStateDescription output
 * - Non-macOS fallback behavior
 * - Edge cases: restricted status, dialog interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { systemPreferences, dialog, shell, app } from 'electron';

// Mock ErrorHandler (must be before import)
vi.mock('../../src/main/ErrorHandler', () => ({
  errorHandler: {
    log: vi.fn(),
  },
}));

import PermissionManager from '../../src/main/PermissionManager';

// Skip in CI — these tests require Electron's systemPreferences (macOS only)
const describeOrSkip = process.env.CI ? describe.skip : describe;

describeOrSkip('PermissionManager (expanded)', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
    vi.clearAllMocks();
  });

  // ========================================================================
  // getPermissionStateDescription
  // ========================================================================

  describe('getPermissionStateDescription', () => {
    it('returns "Enabled" for granted', () => {
      expect(manager.getPermissionStateDescription('microphone', 'granted')).toBe('Enabled');
    });

    it('returns denied message for denied', () => {
      const desc = manager.getPermissionStateDescription('microphone', 'denied');
      expect(desc).toContain('Denied');
      expect(desc).toContain('System Settings');
    });

    it('returns not-set message for not-determined', () => {
      const desc = manager.getPermissionStateDescription('screen', 'not-determined');
      expect(desc).toContain('Not set');
    });

    it('returns restricted message for restricted', () => {
      const desc = manager.getPermissionStateDescription('screen', 'restricted');
      expect(desc).toContain('Restricted');
    });

    it('returns Unknown for unknown states', () => {
      expect(manager.getPermissionStateDescription('microphone', 'something-else')).toBe('Unknown');
    });
  });

  // ========================================================================
  // requestPermission - microphone
  // ========================================================================

  describe('requestPermission - microphone', () => {
    it('returns true if already granted', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted');

      const result = await manager.requestPermission('microphone');

      expect(result).toBe(true);
    });

    it('triggers system prompt for not-determined and returns true if granted', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined');
      vi.mocked(systemPreferences.askForMediaAccess).mockResolvedValue(true);

      const result = await manager.requestPermission('microphone');

      expect(systemPreferences.askForMediaAccess).toHaveBeenCalledWith('microphone');
      expect(result).toBe(true);
    });

    it('shows dialog when not-determined and user denies system prompt', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined');
      vi.mocked(systemPreferences.askForMediaAccess).mockResolvedValue(false);
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      const result = await manager.requestPermission('microphone');

      expect(result).toBe(false);
    });

    it('shows dialog for denied status', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied');
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      const result = await manager.requestPermission('microphone');

      expect(dialog.showMessageBox).toHaveBeenCalled();
      const options = vi.mocked(dialog.showMessageBox).mock.calls[0][0] as Electron.MessageBoxOptions;
      expect(`${options.message}\n${options.detail}`).toContain('MarkuprPlus');
      expect(`${options.message}\n${options.detail}`).not.toContain('MarkuprX');
      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // requestPermission - screen
  // ========================================================================

  describe('requestPermission - screen', () => {
    it('returns true if already granted', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted');

      const result = await manager.requestPermission('screen');

      expect(result).toBe(true);
    });

    it('shows dialog for denied status', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied');
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      const result = await manager.requestPermission('screen');

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // requestPermission - accessibility
  // ========================================================================

  describe('requestPermission - accessibility', () => {
    it('returns true if already trusted', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted');
      vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockReturnValue(true);

      const result = await manager.requestPermission('accessibility');

      expect(result).toBe(true);
    });

    it('shows dialog when not trusted', async () => {
      // First call: getPermissionStatus check returns 'denied'
      vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockReturnValue(false);
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted');
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      const result = await manager.requestPermission('accessibility');

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // showStartupPermissionDialog
  // ========================================================================

  describe('showStartupPermissionDialog', () => {
    it('does nothing when no permissions missing', async () => {
      await manager.showStartupPermissionDialog([]);

      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('shows dialog listing missing permissions', async () => {
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      await manager.showStartupPermissionDialog(['microphone', 'screen']);

      expect(dialog.showMessageBox).toHaveBeenCalled();
      const options = vi.mocked(dialog.showMessageBox).mock.calls[0][0] as Electron.MessageBoxOptions;
      expect(options.detail).toContain('Microphone Access');
      expect(options.detail).toContain('Screen Recording');
      expect(`${options.message}\n${options.detail}`).toContain('MarkuprPlus');
      expect(`${options.message}\n${options.detail}`).not.toContain('MarkuprX');
    });

    it('opens system preferences when user clicks "Set Up Permissions"', async () => {
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });

      await manager.showStartupPermissionDialog(['microphone']);

      expect(shell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_Microphone')
      );
    });

    it('quits app when user clicks "Quit"', async () => {
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 2, checkboxChecked: false });

      await manager.showStartupPermissionDialog(['microphone']);

      expect(app.quit).toHaveBeenCalled();
    });

    it('does nothing when user clicks "Continue Anyway"', async () => {
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      await manager.showStartupPermissionDialog(['microphone']);

      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(app.quit).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // openSystemPreferences
  // ========================================================================

  describe('openSystemPreferences', () => {
    it('opens microphone privacy pane on macOS', async () => {
      await manager.openSystemPreferences('microphone');

      expect(shell.openExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      );
    });

    it('opens screen capture privacy pane on macOS', async () => {
      await manager.openSystemPreferences('screen');

      expect(shell.openExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      );
    });

    it('opens accessibility privacy pane on macOS', async () => {
      await manager.openSystemPreferences('accessibility');

      expect(shell.openExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      );
    });
  });

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('error handling', () => {
    it('returns unknown when getMediaAccessStatus throws', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockImplementation(() => {
        throw new Error('System API unavailable');
      });

      const status = await manager.getPermissionStatus('microphone');

      expect(status).toBe('unknown');
    });

    it('returns unknown when isTrustedAccessibilityClient throws', async () => {
      vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockImplementation(() => {
        throw new Error('System API unavailable');
      });

      const status = await manager.getPermissionStatus('accessibility');

      expect(status).toBe('unknown');
    });

    it('isGranted returns false for unknown status', async () => {
      vi.mocked(systemPreferences.getMediaAccessStatus).mockImplementation(() => {
        throw new Error('System error');
      });

      const granted = await manager.isGranted('microphone');

      expect(granted).toBe(false);
    });
  });

  // ========================================================================
  // setMainWindow
  // ========================================================================

  describe('setMainWindow', () => {
    it('uses main window for dialog when set', async () => {
      const mockWindow = { webContents: { send: vi.fn() } };
      manager.setMainWindow(mockWindow as never);

      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied');
      vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });

      await manager.requestPermission('microphone');

      // When mainWindow is set, dialog.showMessageBox is called with window as first arg
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({ type: 'warning' })
      );
    });
  });
});
