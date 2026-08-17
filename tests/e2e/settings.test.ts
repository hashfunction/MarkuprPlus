/**
 * Settings & Configuration E2E Integration Tests
 *
 * Tests the settings management pipeline end-to-end:
 * - Settings CRUD operations with validation
 * - API key secure storage (keytar + fallbacks)
 * - Settings migration between versions
 * - Change event subscriptions
 * - Schema validation rules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain, safeStorage } from 'electron';
import * as keytar from 'keytar';

// =============================================================================
// Hoisted mocks — vi.hoisted runs before vi.mock factory hoisting
// =============================================================================

const { createMockStoreMap, mockKeychain, storeRefs } = vi.hoisted(() => {
  const createMockStoreMap = () => {
    const data = new Map<string, unknown>();
    return {
      _data: data,
      get: vi.fn((key: string, defaultValue?: unknown) => {
        return data.has(key) ? data.get(key) : defaultValue;
      }),
      set: vi.fn((keyOrObj: string | Record<string, unknown>, value?: unknown) => {
        if (typeof keyOrObj === 'object') {
          for (const [k, v] of Object.entries(keyOrObj)) {
            data.set(k, v);
          }
        } else {
          data.set(keyOrObj, value);
        }
      }),
      delete: vi.fn((key: string) => data.delete(key)),
      clear: vi.fn(() => data.clear()),
      has: vi.fn((key: string) => data.has(key)),
      get store() {
        return Object.fromEntries(data);
      },
      path: '/tmp/test-settings.json',
      size: data.size,
    };
  };

  const mockKeychain = new Map<string, string>();
  const storeRefs = {
    main: null as ReturnType<typeof createMockStoreMap> | null,
    secure: null as ReturnType<typeof createMockStoreMap> | null,
  };

  return { createMockStoreMap, mockKeychain, storeRefs };
});

// =============================================================================
// Mocks — must be before imports
// =============================================================================

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/tmp/test-userdata',
        documents: '/tmp/test-documents',
        logs: '/tmp/test-logs',
      };
      return paths[name] || '/tmp/test';
    }),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '2.4.0'),
    isReady: vi.fn(() => true),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'keychain'),
    encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('encrypted:', '')),
  },
}));

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation((options?: { name?: string; defaults?: Record<string, unknown> }) => {
    const store = createMockStoreMap();

    if (options?.defaults) {
      for (const [key, value] of Object.entries(options.defaults)) {
        store._data.set(key, value);
      }
    }

    if (options?.name === 'secure-keys') {
      storeRefs.secure = store;
    } else {
      storeRefs.main = store;
    }

    return store;
  }),
}));

// Mock keytar
vi.mock('keytar', () => ({
  getPassword: vi.fn((service: string, account: string) => {
    return Promise.resolve(mockKeychain.get(`${service}:${account}`) || null);
  }),
  setPassword: vi.fn((service: string, account: string, password: string) => {
    mockKeychain.set(`${service}:${account}`, password);
    return Promise.resolve();
  }),
  deletePassword: vi.fn((service: string, account: string) => {
    const had = mockKeychain.has(`${service}:${account}`);
    mockKeychain.delete(`${service}:${account}`);
    return Promise.resolve(had);
  }),
}));

vi.mock('fs/promises', () => ({
  chmod: vi.fn(() => Promise.resolve()),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import { SettingsManager, DEFAULT_SETTINGS, SETTINGS_VERSION } from '../../src/main/settings/SettingsManager';
import {
  CURRENT_KEYTAR_SERVICE,
  LEGACY_KEYTAR_SERVICES,
} from '../../src/main/migration/LegacyBrandMigration';
import { IPC_CHANNELS } from '../../src/shared/types';

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls
    .find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

// =============================================================================
// Tests
// =============================================================================

describe('Settings E2E', () => {
  let settings: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKeychain.clear();
    vi.mocked(keytar.getPassword).mockImplementation((service: string, account: string) => (
      Promise.resolve(mockKeychain.get(`${service}:${account}`) || null)
    ));
    vi.mocked(keytar.setPassword).mockImplementation((service: string, account: string, password: string) => {
      mockKeychain.set(`${service}:${account}`, password);
      return Promise.resolve();
    });
    vi.mocked(keytar.deletePassword).mockImplementation((service: string, account: string) => {
      const had = mockKeychain.has(`${service}:${account}`);
      mockKeychain.delete(`${service}:${account}`);
      return Promise.resolve(had);
    });
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('keychain');
    vi.mocked(safeStorage.encryptString).mockImplementation((value: string) => (
      Buffer.from(`encrypted:${value}`)
    ));
    vi.mocked(safeStorage.decryptString).mockImplementation((value: Buffer) => (
      value.toString().replace('encrypted:', '')
    ));
    settings = new SettingsManager();
  });

  // ===========================================================================
  // Core Settings CRUD
  // ===========================================================================

  describe('Core Settings CRUD', () => {
    it('should get default setting values', () => {
      const theme = settings.get('theme');
      // Default is 'system'
      expect(['dark', 'light', 'system']).toContain(theme);
    });

    it('should set and persist a setting value', () => {
      settings.set('debugMode', true);
      expect(settings.get('debugMode')).toBe(true);
    });

    it('should return all settings', () => {
      const all = settings.getAll();
      expect(all).toBeDefined();
      expect(typeof all).toBe('object');
    });

    it('should reset all settings to defaults', () => {
      settings.set('debugMode', true);
      settings.set('theme', 'dark');

      settings.reset();

      // After reset, values should match defaults
      expect(settings.get('debugMode')).toBe(false);
    });

    it('should update multiple settings at once', () => {
      const result = settings.update({
        debugMode: true,
        theme: 'dark',
        imageQuality: 90,
      });

      expect(result).toBeDefined();
      expect(settings.get('debugMode')).toBe(true);
      expect(settings.get('theme')).toBe('dark');
      expect(settings.get('imageQuality')).toBe(90);
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe('Validation', () => {
    it('should reject pauseThreshold outside 500-3000', () => {
      expect(() => settings.set('pauseThreshold', 100)).toThrow('Invalid settings request.');
      expect(settings.get('pauseThreshold')).not.toBe(100);
    });

    it('should accept pauseThreshold within range', () => {
      settings.set('pauseThreshold', 1000);
      expect(settings.get('pauseThreshold')).toBe(1000);
    });

    it('should reject imageQuality outside 1-100', () => {
      expect(() => settings.set('imageQuality', 0)).toThrow('Invalid settings request.');
      expect(settings.get('imageQuality')).not.toBe(0);

      expect(() => settings.set('imageQuality', 101)).toThrow('Invalid settings request.');
      expect(settings.get('imageQuality')).not.toBe(101);
    });

    it('should accept valid imageQuality', () => {
      settings.set('imageQuality', 50);
      expect(settings.get('imageQuality')).toBe(50);
    });

    it('should accept defaultCountdown values 0, 3, 5', () => {
      for (const value of [0, 3, 5] as const) {
        settings.set('defaultCountdown', value);
        expect(settings.get('defaultCountdown')).toBe(value);
      }
    });

    it('should reject invalid defaultCountdown values', () => {
      expect(() => settings.set('defaultCountdown', 2 as any)).toThrow('Invalid settings request.');
      expect(settings.get('defaultCountdown')).not.toBe(2);
    });

    it('should accept valid imageFormat values', () => {
      settings.set('imageFormat', 'png');
      expect(settings.get('imageFormat')).toBe('png');

      settings.set('imageFormat', 'jpeg');
      expect(settings.get('imageFormat')).toBe('jpeg');
    });

    it('should reject invalid imageFormat', () => {
      expect(() => settings.set('imageFormat', 'gif' as any)).toThrow('Invalid settings request.');
      expect(settings.get('imageFormat')).not.toBe('gif');
    });

    it('should accept valid theme values', () => {
      for (const theme of ['dark', 'light', 'system'] as const) {
        settings.set('theme', theme);
        expect(settings.get('theme')).toBe(theme);
      }
    });

    it('should reject invalid theme', () => {
      expect(() => settings.set('theme', 'midnight' as any)).toThrow('Invalid settings request.');
      expect(settings.get('theme')).not.toBe('midnight');
    });

    it('should validate accentColor as hex color', () => {
      settings.set('accentColor', '#FF5733');
      expect(settings.get('accentColor')).toBe('#FF5733');
    });

    it('should reject invalid accentColor', () => {
      expect(() => settings.set('accentColor', 'not-a-color')).toThrow('Invalid settings request.');
      expect(settings.get('accentColor')).not.toBe('not-a-color');
    });

    it('should reject maxImageWidth outside 800-2400', () => {
      expect(() => settings.set('maxImageWidth', 400)).toThrow('Invalid settings request.');
      expect(settings.get('maxImageWidth')).not.toBe(400);
    });

    it('should reject minTimeBetweenCaptures outside 300-2000', () => {
      expect(() => settings.set('minTimeBetweenCaptures', 100)).toThrow('Invalid settings request.');
      expect(settings.get('minTimeBetweenCaptures')).not.toBe(100);
    });
  });

  // ===========================================================================
  // API Key Storage
  // ===========================================================================

  describe('API Key Storage', () => {
    it('should store API key via keytar', async () => {
      await settings.setApiKey('openai', 'sk-test-key-12345');

      const key = await settings.getApiKey('openai');
      expect(key).toBe('sk-test-key-12345');
    });

    it('should return null for non-existent API key', async () => {
      const key = await settings.getApiKey('nonexistent');
      expect(key).toBeNull();
    });

    it('should delete API key', async () => {
      await settings.setApiKey('openai', 'sk-test-key');

      await settings.deleteApiKey('openai');

      const key = await settings.getApiKey('openai');
      expect(key).toBeNull();
    });

    it('should delete migrated keychain entries so they cannot be restored', async () => {
      mockKeychain.set(`${LEGACY_KEYTAR_SERVICES[0]}:openai`, 'sk-legacy-key');

      expect(await settings.getApiKey('openai')).toBe('sk-legacy-key');
      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`)).toBe('sk-legacy-key');

      await settings.deleteApiKey('openai');

      expect(await settings.getApiKey('openai')).toBeNull();
      expect(mockKeychain.has(`${LEGACY_KEYTAR_SERVICES[0]}:openai`)).toBe(false);
    });

    it('retains and retries legacy keychain cleanup after verified migration', async () => {
      const legacyLocation = `${LEGACY_KEYTAR_SERVICES[0]}:openai`;
      mockKeychain.set(legacyLocation, 'legacy-keychain-material');
      vi.mocked(keytar.deletePassword).mockRejectedValueOnce(new Error('cleanup unavailable'));

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-keychain-material');
      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`))
        .toBe('legacy-keychain-material');
      expect(mockKeychain.get(legacyLocation)).toBe('legacy-keychain-material');

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-keychain-material');
      expect(mockKeychain.has(legacyLocation)).toBe(false);
    });

    it('should check if API key exists', async () => {
      expect(await settings.hasApiKey('openai')).toBe(false);

      await settings.setApiKey('openai', 'sk-test-key');

      expect(await settings.hasApiKey('openai')).toBe(true);
    });

    it('should handle different service names independently', async () => {
      await settings.setApiKey('openai', 'sk-openai-key');
      await settings.setApiKey('anthropic', 'sk-anthropic-key');

      expect(await settings.getApiKey('openai')).toBe('sk-openai-key');
      expect(await settings.getApiKey('anthropic')).toBe('sk-anthropic-key');

      await settings.deleteApiKey('openai');
      expect(await settings.getApiKey('openai')).toBeNull();
      expect(await settings.getApiKey('anthropic')).toBe('sk-anthropic-key');
    });

    it('falls back to genuinely protected safeStorage after a keychain failure', async () => {
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('keychain unavailable'));

      await settings.setApiKey('openai', 'test-key-material');

      expect(storeRefs.secure?._data.get('openai')).toBe(
        Buffer.from('encrypted:test-key-material').toString('base64'),
      );
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
      expect(JSON.stringify(settings.getAll())).not.toContain('test-key-material');
    });

    it('fails closed when the current keychain state is unreadable and preserves the old key', async () => {
      const currentLocation = `${CURRENT_KEYTAR_SERVICE}:openai`;
      mockKeychain.set(currentLocation, 'old-key-material');
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('keychain read unavailable'));

      await expect(settings.setApiKey('openai', 'new-key-material'))
        .rejects.toMatchObject({ name: 'SecureStorageUnavailableError' });

      expect(keytar.setPassword).not.toHaveBeenCalled();
      expect(storeRefs.secure?._data.has('openai')).toBe(false);

      vi.mocked(keytar.getPassword).mockImplementation((service: string, account: string) => (
        Promise.resolve(mockKeychain.get(`${service}:${account}`) || null)
      ));
      await expect(settings.getApiKey('openai')).resolves.toBe('old-key-material');
      expect(mockKeychain.get(currentLocation)).toBe('old-key-material');
    });

    it('does not create a fallback when replacing an existing keychain entry fails', async () => {
      const currentLocation = `${CURRENT_KEYTAR_SERVICE}:openai`;
      mockKeychain.set(currentLocation, 'old-key-material');
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('keychain write unavailable'));

      await expect(settings.setApiKey('openai', 'new-key-material'))
        .rejects.toMatchObject({ name: 'SecureStorageUnavailableError' });

      expect(storeRefs.secure?._data.has('openai')).toBe(false);
      expect(mockKeychain.get(currentLocation)).toBe('old-key-material');
    });

    it('fails closed when keychain and protected safeStorage are unavailable', async () => {
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('keychain unavailable'));
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      await expect(settings.setApiKey('openai', 'new-key-material'))
        .rejects.toMatchObject({ name: 'SecureStorageUnavailableError' });

      expect(storeRefs.secure?._data.has('openai')).toBe(false);
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
      expect(JSON.stringify(storeRefs.main?.store)).not.toContain('new-key-material');
    });

    it('rejects Linux basic_text even when Electron reports encryption available', async () => {
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('keychain unavailable'));
      vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('basic_text');

      await expect(settings.setApiKey('openai', 'new-key-material'))
        .rejects.toMatchObject({ name: 'SecureStorageUnavailableError' });
      expect(safeStorage.encryptString).not.toHaveBeenCalled();
      expect(storeRefs.secure?._data.size).toBe(0);
    });

    it('migrates an existing basic_text fallback to a verified keychain write', async () => {
      vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('basic_text');
      storeRefs.secure?._data.set(
        'openai',
        Buffer.from('encrypted:legacy-basic-text-material').toString('base64'),
      );

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-basic-text-material');

      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`))
        .toBe('legacy-basic-text-material');
      expect(storeRefs.secure?._data.has('openai')).toBe(false);
    });

    it('migrates direct legacy plaintext only after a verified secure write', async () => {
      storeRefs.secure?._data.set('plaintext:openai', 'legacy-key-material');

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-key-material');

      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`)).toBe('legacy-key-material');
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
    });

    it('migrates the legacy settings-map plaintext location without exposing it', async () => {
      storeRefs.main?._data.set('__plaintext_fallback__', { openai: 'legacy-map-material' });

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-map-material');

      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`)).toBe('legacy-map-material');
      expect((storeRefs.main?._data.get('__plaintext_fallback__') as Record<string, string>)?.openai)
        .toBeUndefined();
      expect(JSON.stringify(settings.getAll())).not.toContain('legacy-map-material');
    });

    it('removes both legacy plaintext locations after one verified migration', async () => {
      storeRefs.secure?._data.set('plaintext:openai', 'legacy-direct-material');
      storeRefs.main?._data.set('__plaintext_fallback__', {
        openai: 'older-map-material',
        anthropic: 'unrelated-provider-material',
      });

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-direct-material');

      expect(mockKeychain.get(`${CURRENT_KEYTAR_SERVICE}:openai`))
        .toBe('legacy-direct-material');
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
      expect((storeRefs.main?._data.get('__plaintext_fallback__') as Record<string, string>))
        .toEqual({ anthropic: 'unrelated-provider-material' });
    });

    it('cleans every stale fallback for a service after reading a verified current key', async () => {
      mockKeychain.set(`${CURRENT_KEYTAR_SERVICE}:openai`, 'current-key-material');
      mockKeychain.set(`${LEGACY_KEYTAR_SERVICES[0]}:openai`, 'stale-keychain-material');
      storeRefs.secure?._data.set(
        'openai',
        Buffer.from('encrypted:stale-encrypted-material').toString('base64'),
      );
      storeRefs.secure?._data.set('plaintext:openai', 'stale-direct-material');
      storeRefs.main?._data.set('__plaintext_fallback__', { openai: 'stale-map-material' });

      await expect(settings.getApiKey('openai')).resolves.toBe('current-key-material');

      expect(storeRefs.secure?._data.has('openai')).toBe(false);
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
      expect(storeRefs.main?._data.has('__plaintext_fallback__')).toBe(false);
      expect(mockKeychain.has(`${LEGACY_KEYTAR_SERVICES[0]}:openai`)).toBe(false);
    });

    it('retains legacy plaintext when secure migration cannot be verified', async () => {
      storeRefs.secure?._data.set('plaintext:openai', 'legacy-key-material');
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('write failed'));
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-key-material');

      expect(storeRefs.secure?._data.get('plaintext:openai')).toBe('legacy-key-material');
    });

    it('retains and retries legacy cleanup when source deletion fails', async () => {
      storeRefs.secure?._data.set('plaintext:openai', 'legacy-key-material');
      const originalDelete = storeRefs.secure?.delete.getMockImplementation();
      storeRefs.secure?.delete.mockImplementationOnce(() => {
        throw new Error('cleanup failed');
      });

      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-key-material');
      expect(storeRefs.secure?._data.get('plaintext:openai')).toBe('legacy-key-material');

      storeRefs.secure?.delete.mockImplementation(originalDelete ?? (() => false));
      await expect(settings.getApiKey('openai')).resolves.toBe('legacy-key-material');
      expect(storeRefs.secure?._data.has('plaintext:openai')).toBe(false);
    });

    it('attempts every credential location and returns value-free deletion failures', async () => {
      mockKeychain.set(`${CURRENT_KEYTAR_SERVICE}:openai`, 'key-material');
      storeRefs.secure?._data.set('openai', 'encrypted-material');
      storeRefs.secure?._data.set('plaintext:openai', 'legacy-material');
      storeRefs.main?._data.set('__plaintext_fallback__', { openai: 'legacy-map-material' });
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error('key-material leaked in error'));
      storeRefs.secure?.delete.mockImplementation(() => {
        throw new Error('legacy-material leaked in error');
      });

      const result = await settings.deleteApiKey('openai');

      expect(keytar.deletePassword).toHaveBeenCalledTimes(1 + LEGACY_KEYTAR_SERVICES.length);
      expect(storeRefs.secure?.delete).toHaveBeenCalledWith('openai');
      expect(storeRefs.secure?.delete).toHaveBeenCalledWith('plaintext:openai');
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain('material');
    });

    it('reports cleanup failure when a credential backend claims deletion but retains data', async () => {
      mockKeychain.set(`${CURRENT_KEYTAR_SERVICE}:openai`, 'retained-key-material');
      storeRefs.secure?._data.set('openai', 'retained-encrypted-material');
      const originalSecureDelete = storeRefs.secure?.delete.getMockImplementation();
      vi.mocked(keytar.deletePassword).mockResolvedValue(false);
      storeRefs.secure?.delete.mockImplementation(() => false);

      const result = await settings.deleteApiKey('openai');

      expect(result).toEqual({
        success: false,
        failures: [
          { location: 'keychain' },
          { location: 'encrypted-fallback' },
        ],
      });
      expect(JSON.stringify(result)).not.toContain('material');
      storeRefs.secure?.delete.mockImplementation(originalSecureDelete ?? (() => false));
    });
  });

  // ===========================================================================
  // Change Events
  // ===========================================================================

  describe('Change Events', () => {
    it('should notify onChange callback when setting changes', () => {
      const callback = vi.fn();
      settings.onChange(callback);

      settings.set('debugMode', true);

      expect(callback).toHaveBeenCalledWith(
        'debugMode',
        true,
        expect.anything()
      );
    });

    it('should unsubscribe when calling returned function', () => {
      const callback = vi.fn();
      const unsubscribe = settings.onChange(callback);

      settings.set('debugMode', true);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      settings.set('debugMode', false);
      expect(callback).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should notify multiple listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      settings.onChange(cb1);
      settings.onChange(cb2);

      settings.set('theme', 'dark');

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      settings.onChange(errorCallback);
      settings.onChange(normalCallback);

      // Should not throw
      settings.set('debugMode', true);

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Migration
  // ===========================================================================

  describe('Migration', () => {
    it('should define correct settings version', () => {
      expect(SETTINGS_VERSION).toBe(3);
    });

    it('should have correct default settings structure', () => {
      expect(DEFAULT_SETTINGS).toBeDefined();
      expect(DEFAULT_SETTINGS.theme).toBe('system');
      expect(DEFAULT_SETTINGS.debugMode).toBe(false);
      expect(DEFAULT_SETTINGS.launchAtLogin).toBe(false);
      expect(DEFAULT_SETTINGS.checkForUpdates).toBe(true);
      expect(DEFAULT_SETTINGS.defaultCountdown).toBe(0);
      expect(DEFAULT_SETTINGS.imageFormat).toBe('png');
      expect(DEFAULT_SETTINGS.imageQuality).toBe(85);
      expect(DEFAULT_SETTINGS.pauseThreshold).toBe(1500);
      expect(DEFAULT_SETTINGS.transcriptionService).toBe('openai');
      expect(DEFAULT_SETTINGS.hasCompletedOnboarding).toBe(false);
    });

    it('should have correct default hotkey config', () => {
      expect(DEFAULT_SETTINGS.hotkeys).toBeDefined();
      expect(DEFAULT_SETTINGS.hotkeys.toggleRecording).toBe(
        'CommandOrControl+Shift+F'
      );
      expect(DEFAULT_SETTINGS.hotkeys.manualScreenshot).toBe(
        'CommandOrControl+Shift+S'
      );
      expect(DEFAULT_SETTINGS.hotkeys.pauseResume).toBe(
        'CommandOrControl+Shift+P'
      );
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle boolean settings correctly', () => {
      settings.set('debugMode', true);
      expect(settings.get('debugMode')).toBe(true);

      settings.set('debugMode', false);
      expect(settings.get('debugMode')).toBe(false);
    });

    it('should handle string settings correctly', () => {
      settings.set('language', 'es');
      expect(settings.get('language')).toBe('es');
    });

    it('should handle null audioDeviceId', () => {
      settings.set('audioDeviceId', null);
      expect(settings.get('audioDeviceId')).toBeNull();
    });

    it('should handle setting audioDeviceId to a value', () => {
      settings.set('audioDeviceId', 'device-123');
      expect(settings.get('audioDeviceId')).toBe('device-123');
    });

    it('should provide store path for debugging', () => {
      const storePath = settings.getStorePath();
      expect(storePath).toBeTruthy();
      expect(typeof storePath).toBe('string');
    });
  });

  // ===========================================================================
  // IPC Registration
  // ===========================================================================

  describe('IPC Registration', () => {
    it('should register IPC handlers without error', () => {
      // Should not throw
      settings.registerIpcHandlers();
    });

    it('should warn on duplicate IPC registration', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      settings.registerIpcHandlers();
      settings.registerIpcHandlers(); // Second call should warn

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );

      warnSpy.mockRestore();
    });

    it('projects raw legacy data and rejects dangerous keys in deprecated handlers', async () => {
      storeRefs.main?._data.set('__plaintext_fallback__', { openai: 'IPC-SECRET-CANARY' });
      storeRefs.main?._data.set('unknownLegacyKey', 'IPC-SECRET-CANARY');
      settings.registerIpcHandlers();

      const all = await registeredHandler(IPC_CHANNELS.SETTINGS_GET_ALL)({});
      expect(JSON.stringify(all)).not.toContain('IPC-SECRET-CANARY');
      expect(all).not.toHaveProperty('__plaintext_fallback__');
      expect(all).not.toHaveProperty('unknownLegacyKey');

      for (const key of ['__proto__', 'constructor', 'theme.value', '_version']) {
        await expect(Promise.resolve().then(() => (
          registeredHandler(IPC_CHANNELS.SETTINGS_GET)({}, key)
        ))).rejects.toThrow('Invalid settings request.');
        await expect(Promise.resolve().then(() => (
          registeredHandler(IPC_CHANNELS.SETTINGS_SET)({}, key, 'IPC-SECRET-CANARY')
        ))).rejects.toThrow('Invalid settings request.');
      }
      await expect(registeredHandler(IPC_CHANNELS.SETTINGS_GET_API_KEY)({}, 'openai'))
        .resolves.toBeNull();

      const setResult = await registeredHandler(IPC_CHANNELS.SETTINGS_SET)({}, 'theme', 'light');
      expect(setResult).toMatchObject({ theme: 'light' });
      expect(JSON.stringify(setResult)).not.toContain('IPC-SECRET-CANARY');
    });

    it('never logs credential material when storage and deletion fail', async () => {
      const canary = 'LOG-SECRET-CANARY';
      const logs: unknown[][] = [];
      const capture = (...args: unknown[]) => logs.push(args);
      const warn = vi.spyOn(console, 'warn').mockImplementation(capture);
      const error = vi.spyOn(console, 'error').mockImplementation(capture);
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error(canary));
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error(canary));
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      await expect(settings.setApiKey('openai', canary)).rejects.toBeInstanceOf(Error);
      await settings.deleteApiKey('openai');

      expect(JSON.stringify(logs)).not.toContain(canary);
      warn.mockRestore();
      error.mockRestore();
    });
  });
});
