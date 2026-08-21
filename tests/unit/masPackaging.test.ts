import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
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
  it('uses one team qualifier for the MAS app and installer signing passes', async () => {
    const config = load(
      await readFile('electron-builder.mas.yml', 'utf8'),
    ) as {
      mac?: { identity?: string | null };
      mas?: { identity?: string | null };
    };

    expect({
      intermediateIdentity: config.mac?.identity,
      masIdentity: config.mas?.identity,
    }).toEqual({
      intermediateIdentity: null,
      masIdentity: 'Trieflow LLC',
    });
  });

  it('builds one universal Mac App Store artifact', async () => {
    const config = load(
      await readFile('electron-builder.mas.yml', 'utf8'),
    ) as {
      mac?: { target?: Array<{ target?: string; arch?: string[] }> };
    };

    expect(config.mac?.target).toContainEqual({
      target: 'mas',
      arch: ['universal'],
    });
  });

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
