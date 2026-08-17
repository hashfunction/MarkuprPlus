import {
  DEFAULT_SETTINGS,
  isAnalysisProvider,
  isValidAnalysisModelSelections,
  type PublicSettings,
} from './types';

export type PublicSettingKey = keyof PublicSettings;

type Validator<K extends PublicSettingKey> = (
  value: unknown,
) => value is PublicSettings[K];

function isBoundedString(value: unknown, maximum: number, allowEmpty = true): value is string {
  return typeof value === 'string'
    && (allowEmpty || value.length > 0)
    && value.length <= maximum
    && !value.includes('\0');
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isAbsoluteOutputDirectory(value: unknown): value is string {
  if (!isBoundedString(value, 4096, false)) return false;
  return value.startsWith('/')
    || /^[a-z]:[\\/]/iu.test(value)
    || /^\\\\[^\\]/u.test(value);
}

function isHotkeys(value: unknown): value is PublicSettings['hotkeys'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const expected = ['manualScreenshot', 'pauseResume', 'toggleRecording'];
  if (Object.keys(record).sort().join('|') !== expected.join('|')) return false;
  return expected.every((key) => isBoundedString(record[key], 200, false));
}

/**
 * The single runtime codec for public settings. `satisfies` makes adding a new
 * setting a compile-time decision: it cannot silently cross IPC unvalidated.
 */
const PUBLIC_SETTING_VALIDATORS = {
  outputDirectory: isAbsoluteOutputDirectory,
  launchAtLogin: isBoolean,
  checkForUpdates: isBoolean,
  defaultCountdown: (value): value is 0 | 3 | 5 => value === 0 || value === 3 || value === 5,
  showTranscriptionPreview: isBoolean,
  showAudioWaveform: isBoolean,
  pauseThreshold: (value): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 500 && value <= 3000
  ),
  minTimeBetweenCaptures: (value): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 300 && value <= 2000
  ),
  imageFormat: (value): value is 'png' | 'jpeg' => value === 'png' || value === 'jpeg',
  imageQuality: (value): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
  ),
  maxImageWidth: (value): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 800 && value <= 2400
  ),
  transcriptionService: (value): value is 'openai' => value === 'openai',
  language: (value): value is string => isBoundedString(value, 64, false),
  enableKeywordTriggers: isBoolean,
  hotkeys: isHotkeys,
  theme: (value): value is PublicSettings['theme'] => (
    value === 'dark' || value === 'light' || value === 'system'
  ),
  accentColor: (value): value is string => (
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  ),
  audioDeviceId: (value): value is string | null => (
    value === null || isBoundedString(value, 512, false)
  ),
  analysisProvider: (value): value is PublicSettings['analysisProvider'] => isAnalysisProvider(value),
  analysisModelsByProvider: isValidAnalysisModelSelections,
  debugMode: isBoolean,
  keepAudioBackups: isBoolean,
  hasCompletedOnboarding: isBoolean,
} satisfies { [K in PublicSettingKey]: Validator<K> };

export const PUBLIC_SETTING_KEYS = Object.freeze(
  Object.keys(PUBLIC_SETTING_VALIDATORS) as PublicSettingKey[],
);

const PUBLIC_SETTING_KEY_SET = new Set<string>(PUBLIC_SETTING_KEYS);

export class InvalidSettingsPayloadError extends Error {
  constructor(message = 'Invalid settings payload.') {
    super(message);
    this.name = 'InvalidSettingsPayloadError';
  }
}

export function isPublicSettingKey(value: unknown): value is PublicSettingKey {
  return typeof value === 'string'
    && !value.includes('.')
    && PUBLIC_SETTING_KEY_SET.has(value);
}

export function isValidPublicSettingValue<K extends PublicSettingKey>(
  key: K,
  value: unknown,
): value is PublicSettings[K] {
  return PUBLIC_SETTING_VALIDATORS[key](value) as boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Validate an entire untrusted patch before returning any of it. */
export function parsePublicSettingsPatch(value: unknown): Partial<PublicSettings> {
  if (!isPlainRecord(value)) throw new InvalidSettingsPayloadError();

  const parsed: Partial<PublicSettings> = Object.create(null) as Partial<PublicSettings>;
  for (const key of Object.keys(value)) {
    if (!isPublicSettingKey(key)) throw new InvalidSettingsPayloadError();
    const candidate = value[key];
    if (!isValidPublicSettingValue(key, candidate)) throw new InvalidSettingsPayloadError();
    (parsed as Record<string, unknown>)[key] = structuredClone(candidate);
  }
  return parsed;
}

/**
 * Create a fresh, explicit public view. Invalid persisted values fall back to
 * known-good defaults rather than leaking the raw store or crashing the UI.
 */
export function projectPublicSettings(
  source: unknown,
  defaults: PublicSettings = DEFAULT_SETTINGS,
): PublicSettings {
  const record = isPlainRecord(source) ? source : {};
  const projected = {} as PublicSettings;

  for (const key of PUBLIC_SETTING_KEYS) {
    const candidate = record[key];
    const value = isValidPublicSettingValue(key, candidate) ? candidate : defaults[key];
    (projected as unknown as Record<string, unknown>)[key] = structuredClone(value);
  }

  return projected;
}
