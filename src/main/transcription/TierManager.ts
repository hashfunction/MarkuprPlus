/**
 * TierManager.ts - Transcription Tier Selection (Post-Process Architecture)
 *
 * Simplified tier system for post-session transcription:
 * - Tier 1: Local Whisper (default, batch transcription after recording)
 * - Tier 2: Timer-only (fallback, no transcription)
 *
 * In the post-process architecture, transcription no longer happens during
 * recording. TierManager tracks tier availability for the UI and provides
 * tier preference selection for post-session processing.
 */

import { EventEmitter } from 'events';
import { modelDownloadManager } from './ModelDownloadManager';
import { getSettingsManager } from '../settings';
import { getAvailableMemoryBytes } from '../system/AvailableMemory';
import type {
  TranscriptionTier,
  WhisperModel,
  TierStatus,
  TierQuality,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const TIER_PRIORITY: TranscriptionTier[] = ['whisper', 'timer-only'];

const TIER_QUALITY: Record<TranscriptionTier, TierQuality> = {
  whisper: { accuracy: '90%+', latency: 'Post-session' },
  'timer-only': { accuracy: 'N/A', latency: 'N/A' },
};

// Minimum memory for Whisper (2GB)
const WHISPER_MIN_MEMORY = 2 * 1024 * 1024 * 1024;

const MODEL_MEMORY_REQUIREMENT_BYTES: Record<WhisperModel, number> = {
  tiny: 450 * 1024 * 1024,
  base: 800 * 1024 * 1024,
  small: 1400 * 1024 * 1024,
  medium: 2800 * 1024 * 1024,
  large: 5200 * 1024 * 1024,
};

type PreferredTier = 'auto' | TranscriptionTier;

// ============================================================================
// TierManager Class
// ============================================================================

export class TierManager extends EventEmitter {
  private currentTier: TranscriptionTier | null = null;
  private preferredTier: PreferredTier = 'auto';

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the status of all tiers
   */
  async getTierStatuses(): Promise<TierStatus[]> {
    const [whisperStatus, timerStatus] = await Promise.all([
      this.checkWhisperAvailability(),
      this.checkTimerOnlyAvailability(),
    ]);

    return [whisperStatus, timerStatus];
  }

  /**
   * Get the currently active tier
   */
  getCurrentTier(): TranscriptionTier | null {
    return this.currentTier;
  }

  /**
   * Get preferred tier selection. 'auto' means dynamic best-available choice.
   */
  getPreferredTier(): PreferredTier {
    return this.preferredTier;
  }

  /**
   * Set preferred tier selection used for post-session transcription.
   * Only transcription-capable tiers are accepted.
   */
  setPreferredTier(tier: PreferredTier): void {
    if (tier !== 'auto' && !this.tierProvidesTranscription(tier)) {
      throw new Error(
        'This tier does not provide transcription. Select Whisper or Auto.'
      );
    }

    this.preferredTier = tier;
    this.log(`Preferred tier set to: ${tier}`);
  }

  /**
   * Get quality info for a tier
   */
  getTierQuality(tier: TranscriptionTier): TierQuality {
    return TIER_QUALITY[tier];
  }

  /**
   * Check if a tier actually provides transcription
   */
  tierProvidesTranscription(tier: TranscriptionTier): boolean {
    return tier === 'whisper';
  }

  /**
   * Check if we have any tier that can actually transcribe.
   * Considers both local Whisper and cloud OpenAI as valid paths.
   */
  async hasTranscriptionCapability(): Promise<boolean> {
    const statuses = await this.getTierStatuses();
    const hasLocalTier = statuses.some(
      (s) => s.available && this.tierProvidesTranscription(s.tier)
    );
    if (hasLocalTier) {
      return true;
    }

    // Post-session OpenAI transcription is also a valid capability path.
    try {
      const settings = getSettingsManager();
      const openAiKey = await settings.getApiKey('openai');
      return Boolean(openAiKey?.trim());
    } catch {
      return false;
    }
  }

  /**
   * Get all tier qualities
   */
  getAllTierQualities(): Record<TranscriptionTier, TierQuality> {
    return { ...TIER_QUALITY };
  }

  /**
   * Select the best available tier.
   * Respects user preference when available.
   */
  async selectBestTier(): Promise<TranscriptionTier> {
    const statuses = await this.getTierStatuses();

    if (this.preferredTier !== 'auto') {
      const preferredStatus = statuses.find((s) => s.tier === this.preferredTier);
      if (preferredStatus?.available) {
        return this.preferredTier as TranscriptionTier;
      }

      this.log(
        `Preferred tier "${this.preferredTier}" unavailable, using automatic fallover`
      );
    }

    for (const tier of TIER_PRIORITY) {
      const status = statuses.find((s) => s.tier === tier);
      if (status?.available) {
        return tier;
      }
    }

    // Should never reach here - timer-only is always available
    return 'timer-only';
  }

  // ============================================================================
  // Tier Availability Checks
  // ============================================================================

  private async checkWhisperAvailability(): Promise<TierStatus> {
    if (!modelDownloadManager.hasAnyModel()) {
      return { tier: 'whisper', available: false, reason: 'Model not downloaded' };
    }

    const selectedModel = modelDownloadManager.getDefaultModel();
    const requiredMemory = MODEL_MEMORY_REQUIREMENT_BYTES[selectedModel] ?? WHISPER_MIN_MEMORY;

    const freeMemory = getAvailableMemoryBytes();
    if (freeMemory < requiredMemory) {
      return {
        tier: 'whisper',
        available: false,
        reason:
          `Insufficient memory for ${selectedModel} model ` +
          `(${Math.round(freeMemory / 1024 / 1024)}MB available, need ~${Math.round(requiredMemory / 1024 / 1024)}MB)`,
      };
    }

    return { tier: 'whisper', available: true };
  }

  private async checkTimerOnlyAvailability(): Promise<TierStatus> {
    // Timer-only is always available
    return { tier: 'timer-only', available: true };
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string): void {
    console.log(`[TierManager] ${message}`);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const tierManager = new TierManager();
export default TierManager;
