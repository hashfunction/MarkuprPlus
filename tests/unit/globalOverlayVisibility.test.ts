import { describe, expect, it } from 'vitest';
import { resolveGlobalOverlayVisibility } from '../../src/renderer/globalOverlayVisibility';

describe('global overlay visibility', () => {
  it('gives recovery exclusive precedence over onboarding, countdown, and export', () => {
    expect(resolveGlobalOverlayVisibility({
      hasRecovery: true,
      showOnboarding: true,
      showCountdown: true,
      countdownDuration: 5,
      showExport: true,
    })).toEqual({
      recovery: true,
      onboarding: false,
      countdown: false,
      exportDialog: false,
    });
  });

  it('suppresses countdown under onboarding while allowing Export to stack above it', () => {
    expect(resolveGlobalOverlayVisibility({
      hasRecovery: false,
      showOnboarding: true,
      showCountdown: true,
      countdownDuration: 5,
      showExport: true,
    })).toEqual({
      recovery: false,
      onboarding: true,
      countdown: false,
      exportDialog: true,
    });
  });

  it('allows Export over an active configured countdown', () => {
    expect(resolveGlobalOverlayVisibility({
      hasRecovery: false,
      showOnboarding: false,
      showCountdown: true,
      countdownDuration: 3,
      showExport: true,
    })).toEqual({
      recovery: false,
      onboarding: false,
      countdown: true,
      exportDialog: true,
    });
  });
});
