/**
 * SettingsManager - Secure Settings Storage for markuprx
 *
 * Handles:
 * - Persistent settings storage with electron-store (schema validated)
 * - Secure API key storage with keytar (macOS Keychain, Windows Credential Manager)
 * - Encrypted fallback key storage via safeStorage when keytar is unavailable
 * - Settings migration between versions
 * - Change event emission for reactive updates
 * - IPC handlers for renderer access
 *
 * Security:
 * - keytar uses OS-level secure storage (Keychain, Credential Manager)
 * - fallback secrets are encrypted with safeStorage before disk persistence
 * - plaintext fallback is only used as a last resort when secure storage is unavailable
 * - Settings are validated against schema before saving
 */

import Store from 'electron-store';
import * as keytar from 'keytar';
import { app, ipcMain, safeStorage } from 'electron';
import { join } from 'path';
import { chmod } from 'fs/promises';
import {
  IPC_CHANNELS,
  isValidAnalysisModelSelections,
  normalizeAnalysisProvider,
  type AppSettings,
  type HotkeyConfig,
} from '../../shared/types';
import {
  CURRENT_KEYTAR_SERVICE,
  LEGACY_KEYTAR_SERVICES,
} from '../migration/LegacyBrandMigration';

// AppSettings is imported from '../../shared/types' (single source of truth)

/**
 * Settings change callback type
 */
type SettingsChangeCallback = (key: string, newValue: unknown, oldValue: unknown) => void;

/**
 * SettingsManager interface
 */
export interface ISettingsManager {
  // Core
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  getAll(): AppSettings;
  reset(): void;

  // Secure storage (API keys)
  getApiKey(service: string): Promise<string | null>;
  setApiKey(service: string, key: string): Promise<void>;
  deleteApiKey(service: string): Promise<void>;
  hasApiKey(service: string): Promise<boolean>;

  // Events
  onChange(callback: SettingsChangeCallback): () => void;

  // Migration
  migrate(): void;

  // IPC
  registerIpcHandlers(): void;
}

// ============================================================================
// Constants
// ============================================================================

const KEYTAR_SERVICE = CURRENT_KEYTAR_SERVICE;
const FALLBACK_SECRET_STORE_NAME = 'secure-keys';
const LEGACY_INSECURE_SECRET_STORE_KEY = '__plaintext_fallback__';
const INSECURE_SECRET_PREFIX = 'plaintext:';
const SETTINGS_VERSION = 3;

/**
 * Default hotkey configuration
 */
const DEFAULT_HOTKEY_CONFIG: HotkeyConfig = {
  toggleRecording: 'CommandOrControl+Shift+F',
  manualScreenshot: 'CommandOrControl+Shift+S',
  pauseResume: 'CommandOrControl+Shift+P',
};

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: AppSettings = {
  // General
  outputDirectory: '', // Set dynamically in constructor
  launchAtLogin: false,
  checkForUpdates: true,

  // Recording
  defaultCountdown: 0,
  showTranscriptionPreview: true,
  showAudioWaveform: true,

  // Capture
  pauseThreshold: 1500,
  minTimeBetweenCaptures: 500,
  imageFormat: 'png',
  imageQuality: 85,
  maxImageWidth: 1920,

  // Transcription
  transcriptionService: 'openai',
  language: 'en',
  enableKeywordTriggers: false,

  // Hotkeys
  hotkeys: { ...DEFAULT_HOTKEY_CONFIG },

  // Appearance
  theme: 'system',
  accentColor: '#3B82F6', // Blue-500

  // Audio
  audioDeviceId: null,

  // Advanced
  analysisProvider: 'anthropic-api',
  analysisModelsByProvider: {},
  debugMode: false,
  keepAudioBackups: false,

  // Onboarding
  hasCompletedOnboarding: false,
};

/**
 * Schema for electron-store validation
 */
const SETTINGS_SCHEMA = {
  outputDirectory: { type: 'string' },
  launchAtLogin: { type: 'boolean' },
  checkForUpdates: { type: 'boolean' },
  defaultCountdown: { type: 'number', enum: [0, 3, 5] },
  showTranscriptionPreview: { type: 'boolean' },
  showAudioWaveform: { type: 'boolean' },
  pauseThreshold: { type: 'number', minimum: 500, maximum: 3000 },
  minTimeBetweenCaptures: { type: 'number', minimum: 300, maximum: 2000 },
  imageFormat: { type: 'string', enum: ['png', 'jpeg'] },
  imageQuality: { type: 'number', minimum: 1, maximum: 100 },
  maxImageWidth: { type: 'number', minimum: 800, maximum: 2400 },
  transcriptionService: { type: 'string', enum: ['openai'] },
  language: { type: 'string' },
  enableKeywordTriggers: { type: 'boolean' },
  hotkeys: {
    type: 'object',
    properties: {
      toggleRecording: { type: 'string' },
      manualScreenshot: { type: 'string' },
      pauseResume: { type: 'string' },
    },
  },
  theme: { type: 'string', enum: ['dark', 'light', 'system'] },
  accentColor: { type: 'string' },
  audioDeviceId: { type: ['string', 'null'] },
  analysisProvider: {
    type: 'string',
    enum: [
      'rules',
      'anthropic-api',
      'codex-cli',
      'claude-cli',
      'ollama',
      'lmstudio',
      'anthropic',
      'codex',
    ],
  },
  analysisModelsByProvider: {
    type: 'object',
    additionalProperties: { type: 'string', minLength: 1, maxLength: 200 },
  },
  debugMode: { type: 'boolean' },
  keepAudioBackups: { type: 'boolean' },
  hasCompletedOnboarding: { type: 'boolean' },
} as const;

// ============================================================================
// Implementation
// ============================================================================

export class SettingsManager implements ISettingsManager {
  private store: Store<AppSettings>;
  private secureStore: Store<Record<string, string>>;
  private changeCallbacks: Set<SettingsChangeCallback> = new Set();
  private ipcRegistered = false;

  constructor() {
    // Initialize electron-store with schema
    // We use type assertion here because electron-store's Schema type is overly strict
    // and doesn't match JSON Schema 7 format we're using
    this.store = new Store<AppSettings>({
      name: 'settings',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: SETTINGS_SCHEMA as any,
      defaults: this.getDefaultsWithPaths(),
      clearInvalidConfig: false, // Don't clear on schema violation, migrate instead
    });
    this.secureStore = new Store<Record<string, string>>({
      name: FALLBACK_SECRET_STORE_NAME,
      clearInvalidConfig: false,
    });

    // Run migrations
    this.migrate();
    this.store.set('hotkeys', {
      ...DEFAULT_HOTKEY_CONFIG,
      ...(this.store.get('hotkeys') || {}),
    });
    this.normalizeTranscriptionService();

    console.log('[SettingsManager] Initialized with settings version:', SETTINGS_VERSION);
  }

  /**
   * Get defaults with dynamic paths resolved
   */
  private getDefaultsWithPaths(): AppSettings {
    const documentsPath = app.isReady()
      ? app.getPath('documents')
      : join(process.env.HOME || process.env.USERPROFILE || '', 'Documents');

    return {
      ...DEFAULT_SETTINGS,
      outputDirectory: join(documentsPath, 'markuprx'),
    };
  }

  // --------------------------------------------------------------------------
  // Core Methods
  // --------------------------------------------------------------------------

  /**
   * Get a single setting value
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.store.get(key);
  }

  /**
   * Set a single setting value
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const oldValue = this.store.get(key);

    // Validate before setting
    if (!this.validateSetting(key, value)) {
      console.warn(`[SettingsManager] Invalid value for ${key}:`, value);
      return;
    }

    this.store.set(key, value);
    this.emitChange(key, value, oldValue);

    console.log(`[SettingsManager] Set ${key}:`, value);
  }

  /**
   * Get all settings
   */
  getAll(): AppSettings {
    return this.store.store;
  }

  /**
   * Reset all settings to defaults
   */
  reset(): void {
    const oldSettings = this.getAll();
    const defaults = this.getDefaultsWithPaths();

    this.store.clear();
    this.store.set(defaults);

    // Emit changes for all settings
    for (const key of Object.keys(defaults) as Array<keyof AppSettings>) {
      if (oldSettings[key] !== defaults[key]) {
        this.emitChange(key, defaults[key], oldSettings[key]);
      }
    }

    console.log('[SettingsManager] Reset to defaults');
  }

  /**
   * Update multiple settings at once (legacy compatibility method)
   * Note: For new code, prefer using set() for individual settings
   */
  update(updates: Partial<AppSettings>): AppSettings {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        this.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
      }
    }
    return this.getAll();
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validate a single setting value
   */
  private validateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): boolean {
    switch (key) {
      case 'pauseThreshold':
        return typeof value === 'number' && value >= 500 && value <= 3000;

      case 'minTimeBetweenCaptures':
        return typeof value === 'number' && value >= 300 && value <= 2000;

      case 'imageQuality':
        return typeof value === 'number' && value >= 1 && value <= 100;

      case 'maxImageWidth':
        return typeof value === 'number' && value >= 800 && value <= 2400;

      case 'defaultCountdown':
        return value === 0 || value === 3 || value === 5;

      case 'imageFormat':
        return value === 'png' || value === 'jpeg';

      case 'theme':
        return value === 'dark' || value === 'light' || value === 'system';

      case 'transcriptionService':
        return (value as unknown as string) === 'openai';

      case 'analysisProvider':
        return normalizeAnalysisProvider(value) === value;

      case 'analysisModelsByProvider':
        return isValidAnalysisModelSelections(value);

      case 'accentColor':
        return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value as string);

      default:
        return true;
    }
  }

  // --------------------------------------------------------------------------
  // Secure Storage (API Keys)
  // --------------------------------------------------------------------------

  private canUseEncryptedFallback(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private getFallbackApiKey(service: string): string | null {
    try {
      const encrypted = this.secureStore.get(service);
      if (!encrypted) {
        return null;
      }

      if (!this.canUseEncryptedFallback()) {
        console.warn(
          `[SettingsManager] Encrypted fallback exists for ${service}, but safeStorage is unavailable`
        );
        return null;
      }

      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (error) {
      console.warn(`[SettingsManager] Failed to read fallback API key for ${service}:`, error);
      return null;
    }
  }

  private setFallbackApiKey(service: string, key: string): void {
    if (!this.canUseEncryptedFallback()) {
      throw new Error('Secure storage is unavailable. API keys cannot be saved until the app is fully initialized. Try restarting MarkuprX.');
    }

    const encrypted = safeStorage.encryptString(key).toString('base64');
    this.secureStore.set(service, encrypted);
  }

  private clearFallbackApiKey(service: string): void {
    try {
      this.secureStore.delete(service);
    } catch (error) {
      console.warn(`[SettingsManager] Failed to clear fallback API key for ${service}:`, error);
    }
  }

  private getInsecureStoreKey(service: string): string {
    return `${INSECURE_SECRET_PREFIX}${service}`;
  }

  private getInsecureApiKey(service: string): string | null {
    const storeKey = this.getInsecureStoreKey(service);
    const directValue = this.secureStore.get(storeKey);
    if (typeof directValue === 'string' && directValue.length > 0) {
      return directValue;
    }

    // Legacy fallback: previous builds stored a map under settings.json.
    try {
      const insecureMap = this.store.get(
        LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings
      ) as unknown as Record<string, string> | undefined;
      const value = insecureMap?.[service];
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch (error) {
      console.warn(`[SettingsManager] Failed to read plaintext fallback API key for ${service}:`, error);
      return null;
    }
  }

  private setInsecureApiKey(service: string, key: string): void {
    const storeKey = this.getInsecureStoreKey(service);
    this.secureStore.set(storeKey, key);
    // Restrict plaintext fallback file to owner-only access
    chmod(this.secureStore.path, 0o600).catch(() => {});

    // Best-effort cleanup of legacy fallback map entry.
    const legacyMap = (this.store.get(
      LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings
    ) as unknown as Record<string, string> | undefined) || {};
    if (legacyMap[service]) {
      delete legacyMap[service];
      this.store.set(
        LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
        legacyMap as unknown as AppSettings[keyof AppSettings]
      );
    }
  }

  private clearInsecureApiKey(service: string): void {
    try {
      this.secureStore.delete(this.getInsecureStoreKey(service));
    } catch (error) {
      console.warn(`[SettingsManager] Failed to clear plaintext fallback API key for ${service}:`, error);
    }

    const legacyMap = (this.store.get(
      LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings
    ) as unknown as Record<string, string> | undefined) || {};
    if (!legacyMap[service]) {
      return;
    }
    delete legacyMap[service];
    this.store.set(
      LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
      legacyMap as unknown as AppSettings[keyof AppSettings]
    );
  }

  /**
   * Get an API key from secure storage
   */
  async getApiKey(service: string): Promise<string | null> {
    try {
      const key = await keytar.getPassword(KEYTAR_SERVICE, service);
      if (key) {
        return key;
      }

      // Migration path: older builds stored keys under a different keychain service name.
      for (const legacyService of LEGACY_KEYTAR_SERVICES) {
        const legacyKey = await keytar.getPassword(legacyService, service);
        if (!legacyKey) {
          continue;
        }

        try {
          await keytar.setPassword(KEYTAR_SERVICE, service, legacyKey);
          console.log(
            `[SettingsManager] Migrated API key for ${service} from "${legacyService}" to "${KEYTAR_SERVICE}"`
          );
        } catch (migrationError) {
          console.warn(
            `[SettingsManager] Failed to migrate API key for ${service} from "${legacyService}":`,
            migrationError
          );
        }

        return legacyKey;
      }

      return this.getFallbackApiKey(service) || this.getInsecureApiKey(service);
    } catch (error) {
      console.error(`[SettingsManager] Failed to get API key for ${service}:`, error);
      return this.getFallbackApiKey(service) || this.getInsecureApiKey(service);
    }
  }

  /**
   * Store an API key in secure storage
   */
  async setApiKey(service: string, key: string): Promise<void> {
    try {
      await keytar.setPassword(KEYTAR_SERVICE, service, key);
      this.clearFallbackApiKey(service);
      this.clearInsecureApiKey(service);
      console.log(`[SettingsManager] Stored API key for ${service}`);
    } catch (error) {
      console.warn(
        `[SettingsManager] Keytar store failed for ${service}; attempting encrypted fallback:`,
        error
      );

      try {
        this.setFallbackApiKey(service, key);
        this.clearInsecureApiKey(service);
        console.log(`[SettingsManager] Stored API key for ${service} via encrypted fallback`);
      } catch (fallbackError) {
        console.warn(
          `[SettingsManager] Encrypted fallback failed for ${service}; storing plaintext fallback:`,
          fallbackError
        );
        try {
          this.setInsecureApiKey(service, key);
          console.log(`[SettingsManager] Stored API key for ${service} via plaintext fallback`);
        } catch (insecureError) {
          throw new Error(
            `Unable to store API key for ${service}. All storage methods failed. ` +
            `Try restarting MarkuprX or check filesystem permissions. ` +
            `(${insecureError instanceof Error ? insecureError.message : String(insecureError)})`
          );
        }
      }
    }
  }

  /**
   * Delete an API key from secure storage
   */
  async deleteApiKey(service: string): Promise<void> {
    let keytarError: unknown = null;
    for (const keytarService of [KEYTAR_SERVICE, ...LEGACY_KEYTAR_SERVICES]) {
      try {
        await keytar.deletePassword(keytarService, service);
      } catch (error) {
        keytarError ??= error;
        console.warn(
          `[SettingsManager] Failed to delete keytar API key for ${service} from ${keytarService}:`,
          error,
        );
      }
    }

    this.clearFallbackApiKey(service);
    this.clearInsecureApiKey(service);

    if (keytarError && !this.canUseEncryptedFallback()) {
      return;
    }

    console.log(`[SettingsManager] Deleted API key for ${service}`);
  }

  /**
   * Check if an API key exists in secure storage
   */
  async hasApiKey(service: string): Promise<boolean> {
    const key = await this.getApiKey(service);
    return key !== null && key.length > 0;
  }

  // --------------------------------------------------------------------------
  // Change Events
  // --------------------------------------------------------------------------

  /**
   * Subscribe to settings changes
   * @returns Unsubscribe function
   */
  onChange(callback: SettingsChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => {
      this.changeCallbacks.delete(callback);
    };
  }

  /**
   * Emit a change event to all subscribers
   */
  private emitChange(key: string, newValue: unknown, oldValue: unknown): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(key, newValue, oldValue);
      } catch (error) {
        console.error('[SettingsManager] Error in change callback:', error);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Migration
  // --------------------------------------------------------------------------

  /**
   * Run settings migrations
   */
  migrate(): void {
    const currentVersion = this.store.get('_version' as keyof AppSettings) as number | undefined;

    if (currentVersion === SETTINGS_VERSION) {
      return;
    }

    console.log(`[SettingsManager] Migrating from version ${currentVersion || 1} to ${SETTINGS_VERSION}`);

    // Migration from v1 (legacy settings)
    if (!currentVersion || currentVersion < 2) {
      this.migrateV1ToV2();
    }

    if (!currentVersion || currentVersion < 3) {
      this.migrateV2ToV3();
    }

    // Set current version
    this.store.set('_version' as keyof AppSettings, SETTINGS_VERSION as unknown as AppSettings[keyof AppSettings]);
  }

  /**
   * Normalize deprecated transcription service values to the current default.
   */
  private normalizeTranscriptionService(): void {
    const current = this.store.get('transcriptionService') as unknown;
    if (current === 'deepgram') {
      this.store.set('transcriptionService', 'openai');
      console.log('[SettingsManager] Normalized legacy transcriptionService "deepgram" -> "openai"');
    }
  }

  /**
   * Migrate from v1 (legacy JSON settings) to v2 (electron-store with new schema)
   */
  private migrateV1ToV2(): void {
    console.log('[SettingsManager] Running v1 -> v2 migration');

    // Map old settings to new settings
    const legacyMappings: Record<string, keyof AppSettings> = {
      screenshotQuality: 'imageQuality',
      pauseThresholdMs: 'pauseThreshold',
    };

    for (const [oldKey, newKey] of Object.entries(legacyMappings)) {
      const oldValue = this.store.get(oldKey as keyof AppSettings);
      if (oldValue !== undefined) {
        this.store.set(newKey, oldValue);
        this.store.delete(oldKey as keyof AppSettings);
        console.log(`[SettingsManager] Migrated ${oldKey} -> ${newKey}`);
      }
    }

    // Remove deprecated settings
    const deprecatedKeys = ['autoClipboard', 'outputFormat', 'deepgramApiKey'];
    for (const key of deprecatedKeys) {
      if (this.store.has(key as keyof AppSettings)) {
        this.store.delete(key as keyof AppSettings);
        console.log(`[SettingsManager] Removed deprecated setting: ${key}`);
      }
    }

    // Ensure all new settings have defaults
    const defaults = this.getDefaultsWithPaths();
    for (const [key, value] of Object.entries(defaults)) {
      if (!this.store.has(key as keyof AppSettings)) {
        this.store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
      }
    }
  }

  /**
   * Normalize report-provider IDs and initialize per-provider model choices.
   */
  private migrateV2ToV3(): void {
    console.log('[SettingsManager] Running v2 -> v3 migration');
    const provider = this.store.get('analysisProvider') as unknown;
    this.store.set('analysisProvider', normalizeAnalysisProvider(provider));

    const models = this.store.get('analysisModelsByProvider') as unknown;
    if (!isValidAnalysisModelSelections(models)) {
      this.store.set('analysisModelsByProvider', {});
    }
  }

  // --------------------------------------------------------------------------
  // IPC Handlers
  // --------------------------------------------------------------------------

  /**
   * Register IPC handlers for renderer communication.
   *
   * @deprecated Use registerSettingsHandlers() from src/main/ipc/settingsHandlers.ts instead.
   * This method is retained for interface compatibility but should not be called directly.
   * The handlers in settingsHandlers.ts include input validation and service name whitelisting.
   */
  registerIpcHandlers(): void {
    if (this.ipcRegistered) {
      console.warn('[SettingsManager] IPC handlers already registered');
      return;
    }

    const ALLOWED_API_SERVICES = new Set(['openai', 'anthropic']);

    // Get single setting
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: keyof AppSettings) => {
      return this.get(key);
    });

    // Get all settings
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
      return this.getAll();
    });

    // Set single setting
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
      this.set(key, value);
      return this.get(key);
    });

    // Get API key (secure) - with service name whitelist
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY, async (_, service: string) => {
      if (!ALLOWED_API_SERVICES.has(service)) return null;
      return this.getApiKey(service);
    });

    // Set API key (secure) - with service name whitelist
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_API_KEY, async (_, service: string, key: string) => {
      if (!ALLOWED_API_SERVICES.has(service)) return false;
      await this.setApiKey(service, key);
      return true;
    });

    // Delete API key (secure) - with service name whitelist
    ipcMain.handle(IPC_CHANNELS.SETTINGS_DELETE_API_KEY, async (_, service: string) => {
      if (!ALLOWED_API_SERVICES.has(service)) return false;
      await this.deleteApiKey(service);
      return true;
    });

    // Check if API key exists - with service name whitelist
    ipcMain.handle(IPC_CHANNELS.SETTINGS_HAS_API_KEY, async (_, service: string) => {
      if (!ALLOWED_API_SERVICES.has(service)) return false;
      return this.hasApiKey(service);
    });

    this.ipcRegistered = true;
    console.log('[SettingsManager] IPC handlers registered');
  }

  /**
   * Get the storage path for debugging
   */
  getStorePath(): string {
    return this.store.path;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let instance: SettingsManager | null = null;

/**
 * Get or create the SettingsManager singleton
 */
export function getSettingsManager(): SettingsManager {
  if (!instance) {
    instance = new SettingsManager();
  }
  return instance;
}

/**
 * Create a new SettingsManager instance (for testing)
 */
export function createSettingsManager(): SettingsManager {
  return new SettingsManager();
}

export { DEFAULT_SETTINGS, SETTINGS_VERSION };
// Re-export AppSettings from shared/types for downstream consumers
export type { AppSettings } from '../../shared/types';
