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
 * - new writes fail closed when neither protected backend is available
 * - legacy plaintext is read only for verified migration and subsequent cleanup
 * - public settings cross IPC only through an explicit validated projection
 */

import Store from 'electron-store';
import * as keytar from 'keytar';
import { app, ipcMain, safeStorage } from 'electron';
import { join } from 'path';
import {
  DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS,
  IPC_CHANNELS,
  isValidAnalysisModelSelections,
  normalizeAnalysisProvider,
  type AppSettings,
  type HotkeyConfig,
  type PublicSettings,
} from '../../shared/types';
import {
  PUBLIC_SETTING_KEYS,
  isPublicSettingKey,
  isValidPublicSettingValue,
  parsePublicSettingsPatch,
  projectPublicSettings,
  type PublicSettingKey,
} from '../../shared/publicSettings';
import {
  CURRENT_KEYTAR_SERVICE,
  LEGACY_KEYTAR_SERVICES,
} from '../migration/LegacyBrandMigration';
import { isElectronTestHarnessAllowed } from '../e2e/ElectronTestHarness';

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
  get<K extends PublicSettingKey>(key: K): PublicSettings[K];
  set<K extends PublicSettingKey>(key: K, value: PublicSettings[K]): void;
  getAll(): PublicSettings;
  reset(): void;

  // Secure storage (API keys)
  getApiKey(service: string): Promise<string | null>;
  setApiKey(service: string, key: string): Promise<void>;
  deleteApiKey(service: string): Promise<CredentialDeletionResult>;
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

export type CredentialStorageLocation =
  | 'keychain'
  | 'encrypted-fallback'
  | 'legacy-plaintext';

export interface CredentialDeletionResult {
  success: boolean;
  failures: Array<{ location: CredentialStorageLocation }>;
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('Secure credential storage is unavailable.');
    this.name = 'SecureStorageUnavailableError';
  }
}

class KeychainStateUnavailableError extends Error {}
class KeychainFallbackAllowedError extends Error {}

function electronTestHarnessAllowed(): boolean {
  return isElectronTestHarnessAllowed({
    requested: process.env.MARKUPRX_E2E === '1',
    isPackaged: app.isPackaged,
  });
}

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
const DEFAULT_SETTINGS: PublicSettings = SHARED_DEFAULT_SETTINGS;

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
  private getDefaultsWithPaths(): PublicSettings {
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
  get<K extends PublicSettingKey>(key: K): PublicSettings[K] {
    return this.getAll()[key];
  }

  /**
   * Set a single setting value
   */
  set<K extends PublicSettingKey>(key: K, value: PublicSettings[K]): void {
    if (!isPublicSettingKey(key) || !isValidPublicSettingValue(key, value)) {
      throw new Error('Invalid settings request.');
    }

    const oldValue = this.store.get(key);
    this.store.set(key, value);
    this.emitChange(key, value, oldValue);

    console.log(`[SettingsManager] Updated setting: ${key}`);
  }

  /**
   * Get all settings
   */
  getAll(): PublicSettings {
    // Read each allowlisted key explicitly. Besides keeping the boundary
    // auditable, this avoids ever materializing the raw persisted store where
    // migration metadata or legacy credential records may coexist.
    const publicValues = Object.fromEntries(
      PUBLIC_SETTING_KEYS.map((key) => [key, this.store.get(key)]),
    );
    return projectPublicSettings(publicValues, this.getDefaultsWithPaths());
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
    for (const key of Object.keys(defaults) as PublicSettingKey[]) {
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
  update(updates: Partial<PublicSettings>): PublicSettings {
    const validated = parsePublicSettingsPatch(updates);
    const oldSettings = this.getAll();

    // electron-store applies an object update synchronously. Validation above
    // completes for the whole patch before this single mutation occurs.
    this.store.set(validated as unknown as AppSettings);
    for (const key of Object.keys(validated) as PublicSettingKey[]) {
      this.emitChange(key, validated[key], oldSettings[key]);
    }
    return this.getAll();
  }

  // --------------------------------------------------------------------------
  // Secure Storage (API Keys)
  // --------------------------------------------------------------------------

  private canUseEncryptedFallback(): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      try {
        // Electron documents `basic_text` as an unprotected Linux backend. It
        // is storage obfuscation, not encryption, so it never receives a key.
        return safeStorage.getSelectedStorageBackend() !== 'basic_text';
      } catch {
        // Backend selection is a Linux-only API in Electron 28. On macOS and
        // Windows, a successful isEncryptionAvailable() is authoritative.
        return process.platform !== 'linux';
      }
    } catch {
      return false;
    }
  }

  private decryptStoredFallbackApiKey(
    service: string,
    requireProtectedBackend: boolean,
  ): string | null {
    try {
      const encrypted = this.secureStore.get(service);
      if (!encrypted) {
        return null;
      }

      if (requireProtectedBackend && !this.canUseEncryptedFallback()) return null;
      if (!safeStorage.isEncryptionAvailable()) return null;

      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      console.warn(`[SettingsManager] Could not read encrypted credential storage for ${service}.`);
      return null;
    }
  }

  private getFallbackApiKey(service: string): string | null {
    return this.decryptStoredFallbackApiKey(service, true);
  }

  private getLegacyUnprotectedFallbackApiKey(service: string): string | null {
    if (this.canUseEncryptedFallback()) return null;
    return this.decryptStoredFallbackApiKey(service, false);
  }

  private cleanupStoredFallbackApiKey(service: string): void {
    try {
      this.secureStore.delete(service);
    } catch {
      console.warn(`[SettingsManager] Stale credential cleanup will be retried for ${service}.`);
    }
  }

  private setFallbackApiKeyVerified(service: string, key: string): void {
    if (!this.canUseEncryptedFallback()) {
      throw new SecureStorageUnavailableError();
    }

    let previous: string | undefined;
    try {
      previous = this.secureStore.get(service);
    } catch {
      throw new SecureStorageUnavailableError();
    }
    try {
      const encrypted = safeStorage.encryptString(key).toString('base64');
      this.secureStore.set(service, encrypted);
      if (this.getFallbackApiKey(service) !== key) {
        throw new SecureStorageUnavailableError();
      }
    } catch {
      try {
        if (previous === undefined) this.secureStore.delete(service);
        else this.secureStore.set(service, previous);
      } catch {
        // The original value remains the source of truth when rollback itself
        // is unavailable. Never attempt a plaintext recovery write.
      }
      throw new SecureStorageUnavailableError();
    }
  }

  private getInsecureStoreKey(service: string): string {
    return `${INSECURE_SECRET_PREFIX}${service}`;
  }

  private getLegacyPlaintextApiKey(service: string): string | null {
    try {
      const directValue = this.secureStore.get(this.getInsecureStoreKey(service));
      if (typeof directValue === 'string' && directValue.length > 0) return directValue;

      const insecureMap = this.store.get(
        LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
      ) as unknown as Record<string, unknown> | undefined;
      const value = insecureMap?.[service];
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      console.warn(`[SettingsManager] Could not inspect legacy credential storage for ${service}.`);
      return null;
    }
  }

  private cleanupLegacyPlaintextApiKey(service: string): boolean {
    let cleaned = true;
    try {
      const directKey = this.getInsecureStoreKey(service);
      this.secureStore.delete(directKey);
    } catch {
      cleaned = false;
      console.warn(`[SettingsManager] Legacy credential cleanup will be retried for ${service}.`);
    }

    try {
      const storedMap = this.store.get(
        LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
      ) as unknown as Record<string, unknown> | undefined;
      if (storedMap && Object.prototype.hasOwnProperty.call(storedMap, service)) {
        const updatedMap = { ...storedMap };
        delete updatedMap[service];
        if (Object.keys(updatedMap).length === 0) {
          this.store.delete(LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings);
        } else {
          this.store.set(
            LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
            updatedMap as unknown as AppSettings[keyof AppSettings],
          );
        }
      }
    } catch {
      cleaned = false;
      console.warn(`[SettingsManager] Legacy credential cleanup will be retried for ${service}.`);
    }
    return cleaned;
  }

  private async getKeychainApiKey(service: string): Promise<string | null> {
    if (electronTestHarnessAllowed()) return null;
    try {
      return await keytar.getPassword(KEYTAR_SERVICE, service);
    } catch {
      console.warn(`[SettingsManager] Could not read keychain credential for ${service}.`);
      // Absence and unreadability have different authority semantics. Falling
      // through here could activate an older fallback credential while a
      // newer keychain entry merely happens to be temporarily unreadable.
      throw new SecureStorageUnavailableError();
    }
  }

  private async getCurrentSecureApiKey(service: string): Promise<string | null> {
    return (await this.getKeychainApiKey(service)) || this.getFallbackApiKey(service);
  }

  private async cleanupLegacyKeychainApiKeys(
    service: string,
  ): Promise<void> {
    if (electronTestHarnessAllowed()) return;
    for (const legacyService of LEGACY_KEYTAR_SERVICES) {
      try {
        await keytar.deletePassword(legacyService, service);
        if (await keytar.getPassword(legacyService, service)) {
          console.warn(`[SettingsManager] Legacy keychain cleanup will be retried for ${service}.`);
        }
      } catch {
        console.warn(`[SettingsManager] Legacy keychain cleanup will be retried for ${service}.`);
      }
    }
  }

  private async setKeychainApiKeyVerified(service: string, key: string): Promise<void> {
    if (electronTestHarnessAllowed()) throw new SecureStorageUnavailableError();
    let previous: string | null;
    try {
      previous = await keytar.getPassword(KEYTAR_SERVICE, service);
    } catch {
      // Do not overwrite an entry that cannot be read and therefore cannot be
      // restored if verification fails.
      throw new KeychainStateUnavailableError();
    }

    let writeCompleted = false;
    try {
      await keytar.setPassword(KEYTAR_SERVICE, service, key);
      writeCompleted = true;
      if (await keytar.getPassword(KEYTAR_SERVICE, service) !== key) {
        throw new SecureStorageUnavailableError();
      }
    } catch {
      try {
        if (previous === null) await keytar.deletePassword(KEYTAR_SERVICE, service);
        else await keytar.setPassword(KEYTAR_SERVICE, service, previous);
        if (await keytar.getPassword(KEYTAR_SERVICE, service) !== previous) {
          throw new SecureStorageUnavailableError();
        }
      } catch {
        // Never introduce another storage format when keychain rollback fails.
        throw new SecureStorageUnavailableError();
      }
      if (!writeCompleted && previous === null) throw new KeychainFallbackAllowedError();
      throw new SecureStorageUnavailableError();
    }
  }

  private async storeSecureApiKey(
    service: string,
    key: string,
  ): Promise<'keychain' | 'encrypted-fallback'> {
    if (!electronTestHarnessAllowed()) {
      try {
        await this.setKeychainApiKeyVerified(service, key);
        return 'keychain';
      } catch (error) {
        if (error instanceof KeychainStateUnavailableError) {
          throw new SecureStorageUnavailableError();
        }
        if (!(error instanceof KeychainFallbackAllowedError)) {
          throw error;
        }
        console.warn(`[SettingsManager] Keychain write unavailable for ${service}; trying protected fallback.`);
      }
    }

    this.setFallbackApiKeyVerified(service, key);
    return 'encrypted-fallback';
  }

  private async migrateLegacyPlaintextApiKey(
    service: string,
    legacyValue: string,
  ): Promise<void> {
    try {
      await this.storeSecureApiKey(service, legacyValue);
      const verified = await this.getCurrentSecureApiKey(service);
      if (verified !== legacyValue) throw new SecureStorageUnavailableError();
      this.cleanupLegacyPlaintextApiKey(service);
    } catch {
      console.warn(`[SettingsManager] Legacy credential migration will be retried for ${service}.`);
    }
  }

  /**
   * Get an API key from secure storage
   */
  async getApiKey(service: string): Promise<string | null> {
    const keychainCurrent = await this.getKeychainApiKey(service);
    if (keychainCurrent) {
      await this.cleanupLegacyKeychainApiKeys(service);
      this.cleanupStoredFallbackApiKey(service);
      this.cleanupLegacyPlaintextApiKey(service);
      return keychainCurrent;
    }

    const fallbackCurrent = this.getFallbackApiKey(service);
    if (fallbackCurrent) {
      this.cleanupLegacyPlaintextApiKey(service);
      return fallbackCurrent;
    }

    if (!electronTestHarnessAllowed()) {
      for (const legacyService of LEGACY_KEYTAR_SERVICES) {
        let legacyKey: string | null = null;
        try {
          legacyKey = await keytar.getPassword(legacyService, service);
        } catch {
          console.warn(`[SettingsManager] Could not read a legacy keychain credential for ${service}.`);
        }
        if (!legacyKey) {
          continue;
        }

        try {
          await this.storeSecureApiKey(service, legacyKey);
          if (await this.getCurrentSecureApiKey(service) === legacyKey) {
            await this.cleanupLegacyKeychainApiKeys(service);
          }
        } catch {
          console.warn(`[SettingsManager] Legacy keychain migration will be retried for ${service}.`);
        }

        return legacyKey;
      }
    }

    const legacyUnprotectedFallback = this.getLegacyUnprotectedFallbackApiKey(service);
    if (legacyUnprotectedFallback) {
      try {
        await this.storeSecureApiKey(service, legacyUnprotectedFallback);
        if (await this.getCurrentSecureApiKey(service) === legacyUnprotectedFallback) {
          this.cleanupStoredFallbackApiKey(service);
        }
      } catch {
        console.warn(`[SettingsManager] Legacy credential migration will be retried for ${service}.`);
      }
      return legacyUnprotectedFallback;
    }

    const legacyPlaintext = this.getLegacyPlaintextApiKey(service);
    if (!legacyPlaintext) return null;
    await this.migrateLegacyPlaintextApiKey(service, legacyPlaintext);
    return legacyPlaintext;
  }

  /**
   * Store an API key in secure storage
   */
  async setApiKey(service: string, key: string): Promise<void> {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > 20_000) {
      throw new SecureStorageUnavailableError();
    }

    const location = await this.storeSecureApiKey(service, key);
    if (location === 'keychain') {
      try {
        this.secureStore.delete(service);
      } catch {
        console.warn(`[SettingsManager] Stale encrypted credential cleanup failed for ${service}.`);
      }
    }
    this.cleanupLegacyPlaintextApiKey(service);
    console.log(`[SettingsManager] Stored credential securely for ${service}.`);
  }

  /**
   * Delete an API key from secure storage
   */
  async deleteApiKey(service: string): Promise<CredentialDeletionResult> {
    const failures: CredentialDeletionResult['failures'] = [];
    const recordFailure = (location: CredentialStorageLocation): void => {
      if (!failures.some((failure) => failure.location === location)) {
        failures.push({ location });
      }
    };

    if (!electronTestHarnessAllowed()) {
      for (const keytarService of [KEYTAR_SERVICE, ...LEGACY_KEYTAR_SERVICES]) {
        try {
          await keytar.deletePassword(keytarService, service);
          if (await keytar.getPassword(keytarService, service) !== null) {
            recordFailure('keychain');
          }
        } catch {
          recordFailure('keychain');
          console.warn(`[SettingsManager] Keychain credential deletion failed for ${service}.`);
        }
      }
    }

    try {
      this.secureStore.delete(service);
      if (this.secureStore.get(service) !== undefined) {
        recordFailure('encrypted-fallback');
      }
    } catch {
      recordFailure('encrypted-fallback');
      console.warn(`[SettingsManager] Encrypted credential deletion failed for ${service}.`);
    }

    try {
      const legacyDirectKey = this.getInsecureStoreKey(service);
      this.secureStore.delete(legacyDirectKey);
      if (this.secureStore.get(legacyDirectKey) !== undefined) {
        recordFailure('legacy-plaintext');
      }
    } catch {
      recordFailure('legacy-plaintext');
      console.warn(`[SettingsManager] Legacy credential deletion failed for ${service}.`);
    }

    try {
      const storedMap = this.store.get(
        LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
      ) as unknown as Record<string, unknown> | undefined;
      if (storedMap && Object.prototype.hasOwnProperty.call(storedMap, service)) {
        const updatedMap = { ...storedMap };
        delete updatedMap[service];
        if (Object.keys(updatedMap).length === 0) {
          this.store.delete(LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings);
        } else {
          this.store.set(
            LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
            updatedMap as unknown as AppSettings[keyof AppSettings],
          );
        }
        const remainingMap = this.store.get(
          LEGACY_INSECURE_SECRET_STORE_KEY as keyof AppSettings,
        ) as unknown as Record<string, unknown> | undefined;
        if (remainingMap && Object.prototype.hasOwnProperty.call(remainingMap, service)) {
          recordFailure('legacy-plaintext');
        }
      }
    } catch {
      recordFailure('legacy-plaintext');
      console.warn(`[SettingsManager] Legacy credential deletion failed for ${service}.`);
    }

    return { success: failures.length === 0, failures };
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
      } catch {
        console.error('[SettingsManager] Settings change callback failed.');
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
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: unknown) => {
      if (!isPublicSettingKey(key)) throw new Error('Invalid settings request.');
      return this.get(key);
    });

    // Get all settings
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
      return this.getAll();
    });

    // Set single setting
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, key: unknown, value: unknown) => {
      if (!isPublicSettingKey(key) || !isValidPublicSettingValue(key, value)) {
        throw new Error('Invalid settings request.');
      }
      this.set(key, value);
      return this.getAll();
    });

    // Get API key (secure) - with service name whitelist
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY, async () => {
      return null;
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
      const result = await this.deleteApiKey(service);
      return result.success;
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
