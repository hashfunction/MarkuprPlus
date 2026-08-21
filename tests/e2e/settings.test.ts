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

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
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

// =============================================================================
// Tests
// =============================================================================

describe('Settings E2E', () => {
  let settings: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKeychain.clear();
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
      settings.set('pauseThreshold', 100); // Too low
      // Invalid values are silently rejected
      expect(settings.get('pauseThreshold')).not.toBe(100);
    });

    it('should accept pauseThreshold within range', () => {
      settings.set('pauseThreshold', 1000);
      expect(settings.get('pauseThreshold')).toBe(1000);
    });

    it('should reject imageQuality outside 1-100', () => {
      settings.set('imageQuality', 0); // Too low
      expect(settings.get('imageQuality')).not.toBe(0);

      settings.set('imageQuality', 101); // Too high
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
      settings.set('defaultCountdown', 2 as any);
      expect(settings.get('defaultCountdown')).not.toBe(2);
    });

    it('should accept valid imageFormat values', () => {
      settings.set('imageFormat', 'png');
      expect(settings.get('imageFormat')).toBe('png');

      settings.set('imageFormat', 'jpeg');
      expect(settings.get('imageFormat')).toBe('jpeg');
    });

    it('should reject invalid imageFormat', () => {
      settings.set('imageFormat', 'gif' as any);
      expect(settings.get('imageFormat')).not.toBe('gif');
    });

    it('should accept valid theme values', () => {
      for (const theme of ['dark', 'light', 'system'] as const) {
        settings.set('theme', theme);
        expect(settings.get('theme')).toBe(theme);
      }
    });

    it('should reject invalid theme', () => {
      settings.set('theme', 'midnight' as any);
      expect(settings.get('theme')).not.toBe('midnight');
    });

    it('should validate accentColor as hex color', () => {
      settings.set('accentColor', '#FF5733');
      expect(settings.get('accentColor')).toBe('#FF5733');
    });

    it('should reject invalid accentColor', () => {
      settings.set('accentColor', 'not-a-color');
      expect(settings.get('accentColor')).not.toBe('not-a-color');
    });

    it('should reject maxImageWidth outside 800-2400', () => {
      settings.set('maxImageWidth', 400); // Too low
      expect(settings.get('maxImageWidth')).not.toBe(400);
    });

    it('should reject minTimeBetweenCaptures outside 300-2000', () => {
      settings.set('minTimeBetweenCaptures', 100); // Too low
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
  });
});
