export interface GlobalOverlayVisibilityInput {
  hasRecovery: boolean;
  showOnboarding: boolean;
  showCountdown: boolean;
  countdownDuration: number;
  showExport: boolean;
}

export interface GlobalOverlayVisibility {
  recovery: boolean;
  onboarding: boolean;
  countdown: boolean;
  exportDialog: boolean;
}

export function resolveGlobalOverlayVisibility(
  input: GlobalOverlayVisibilityInput,
): GlobalOverlayVisibility {
  const recovery = input.hasRecovery;
  const onboarding = !recovery && input.showOnboarding;
  return {
    recovery,
    onboarding,
    countdown: !recovery
      && !onboarding
      && input.showCountdown
      && input.countdownDuration > 0,
    exportDialog: !recovery && input.showExport,
  };
}
