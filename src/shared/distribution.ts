export type DistributionKind = 'direct' | 'mas';

export interface DistributionCapabilities {
  externalCliProviders: boolean;
  externalInputObserver: boolean;
  selfUpdater: boolean;
}

declare const __MARKUPRPLUS_DISTRIBUTION__: unknown;

export function normalizeDistribution(value: unknown): DistributionKind {
  return value === 'mas' ? 'mas' : 'direct';
}

export function capabilitiesForDistribution(
  kind: DistributionKind,
): DistributionCapabilities {
  const direct = kind === 'direct';
  return {
    externalCliProviders: direct,
    externalInputObserver: direct,
    selfUpdater: direct,
  };
}

export function currentDistribution(): DistributionKind {
  const configured = typeof __MARKUPRPLUS_DISTRIBUTION__ === 'undefined'
    ? undefined
    : __MARKUPRPLUS_DISTRIBUTION__;
  return normalizeDistribution(configured);
}

export function currentDistributionCapabilities(): DistributionCapabilities {
  return capabilitiesForDistribution(currentDistribution());
}
