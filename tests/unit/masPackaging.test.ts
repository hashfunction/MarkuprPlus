import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  parseTrueEntitlements,
  validateMasEvidence,
  type MasPackageEvidence,
} from '../../scripts/verify-mas-package.mjs';

function validEvidence(
  overrides: Partial<MasPackageEvidence> = {},
): MasPackageEvidence {
  return {
    bundleIdentifier: 'com.eddiesanjuan.markuprx',
    displayName: 'MarkuprPlus',
    architectures: ['x86_64', 'arm64'],
    trueEntitlements: new Set([
      'com.apple.security.app-sandbox',
      'com.apple.security.network.client',
      'com.apple.security.device.audio-input',
      'com.apple.security.files.user-selected.read-write',
    ]),
    hasUpdaterMetadata: false,
    hasEmbeddedProfile: true,
    signatureValid: true,
    ...overrides,
  };
}

describe('Mac App Store packaging policy', () => {
  it('accepts a signed universal sandbox bundle with only Store update delivery', () => {
    expect(validateMasEvidence(validEvidence())).toEqual([]);
  });

  it('rejects missing sandbox access, updater metadata, profile, signature, or architecture', () => {
    const invalid = validEvidence({
      architectures: ['arm64'],
      trueEntitlements: new Set(['com.apple.security.network.client']),
      hasUpdaterMetadata: true,
      hasEmbeddedProfile: false,
      signatureValid: false,
    });

    expect(validateMasEvidence(invalid)).toEqual(expect.arrayContaining([
      'MAS bundle must contain x86_64 and arm64 architectures.',
      'Missing true entitlement: com.apple.security.app-sandbox',
      'Missing true entitlement: com.apple.security.device.audio-input',
      'Missing true entitlement: com.apple.security.files.user-selected.read-write',
      'MAS bundle must not contain app-update.yml.',
      'MAS bundle must contain embedded.provisionprofile.',
      'MAS bundle signature is invalid.',
    ]));
  });

  it('reads the required main and inherited sandbox entitlements', async () => {
    const [mainPlist, childPlist] = await Promise.all([
      readFile('build/entitlements.mas.plist', 'utf8'),
      readFile('build/entitlements.mas.inherit.plist', 'utf8'),
    ]);

    expect(parseTrueEntitlements(mainPlist)).toEqual(expect.arrayContaining([
      'com.apple.security.app-sandbox',
      'com.apple.security.network.client',
      'com.apple.security.device.audio-input',
      'com.apple.security.files.user-selected.read-write',
    ]));
    expect(parseTrueEntitlements(childPlist)).toEqual(expect.arrayContaining([
      'com.apple.security.app-sandbox',
      'com.apple.security.inherit',
    ]));
  });
});
