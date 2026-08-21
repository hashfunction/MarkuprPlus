import { describe, expect, it } from 'vitest';
import {
  capabilitiesForDistribution,
  normalizeDistribution,
} from '../../src/shared/distribution';

describe('distribution capabilities', () => {
  it('keeps external integrations in direct builds and disables them in Store builds', () => {
    expect(capabilitiesForDistribution('direct')).toEqual({
      externalCliProviders: true,
      externalInputObserver: true,
      selfUpdater: true,
    });
    expect(capabilitiesForDistribution('mas')).toEqual({
      externalCliProviders: false,
      externalInputObserver: false,
      selfUpdater: false,
    });
  });

  it('fails unknown build values closed to the direct distribution', () => {
    expect(normalizeDistribution('mas')).toBe('mas');
    expect(normalizeDistribution('direct')).toBe('direct');
    expect(normalizeDistribution('unexpected')).toBe('direct');
    expect(normalizeDistribution(undefined)).toBe('direct');
  });
});
