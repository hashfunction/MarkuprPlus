/**
 * notarize-dmg.mjs
 *
 * The `afterSign` hook notarizes and staples the .app bundle, which is what
 * Gatekeeper checks when the app is launched. The DMG that wraps it is built
 * afterwards and carries no ticket of its own, so a freshly downloaded (and
 * therefore quarantined) DMG is assessed online at mount time and fails closed
 * when the user has no network.
 *
 * This script submits each built DMG to Apple and staples the ticket to it, so
 * the installer validates offline too.
 *
 * Usage: node scripts/notarize-dmg.mjs [releaseRoot]
 *
 * Credentials are read from the same environment variables as
 * scripts/notarize.cjs. Set MARKUPRX_REQUIRE_NOTARIZATION=1 to fail when they
 * are absent instead of skipping.
 */

import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const releaseRoot = resolve(process.argv[2] || 'release');

const log = {
  info: (msg) => console.log(`[notarize-dmg] INFO: ${msg}`),
  progress: (msg) => console.log(`[notarize-dmg] >>> ${msg}`),
  success: (msg) => console.log(`[notarize-dmg] SUCCESS: ${msg}`),
  warn: (msg) => console.warn(`[notarize-dmg] WARN: ${msg}`),
  error: (msg) => console.error(`[notarize-dmg] ERROR: ${msg}`),
};

function notarizationRequired() {
  const flag = String(process.env.MARKUPRX_REQUIRE_NOTARIZATION || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * Build the notarytool authentication arguments from the environment.
 * Mirrors the credential precedence in scripts/notarize.cjs.
 */
function notarytoolCredentials() {
  const {
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
    APPLE_KEYCHAIN_PROFILE,
    APPLE_KEYCHAIN,
  } = process.env;

  if (APPLE_API_KEY && APPLE_API_KEY_ID) {
    if (!existsSync(APPLE_API_KEY)) {
      throw new Error(`APPLE_API_KEY does not point at an existing .p8 key: ${APPLE_API_KEY}`);
    }
    return {
      strategy: 'App Store Connect API key',
      args: [
        '--key', APPLE_API_KEY,
        '--key-id', APPLE_API_KEY_ID,
        ...(APPLE_API_ISSUER ? ['--issuer', APPLE_API_ISSUER] : []),
      ],
    };
  }

  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return {
      strategy: 'Apple ID + app-specific password',
      args: [
        '--apple-id', APPLE_ID,
        '--password', APPLE_APP_SPECIFIC_PASSWORD,
        '--team-id', APPLE_TEAM_ID,
      ],
    };
  }

  if (APPLE_KEYCHAIN_PROFILE) {
    return {
      strategy: 'notarytool keychain profile',
      args: [
        '--keychain-profile', APPLE_KEYCHAIN_PROFILE,
        ...(APPLE_KEYCHAIN ? ['--keychain', APPLE_KEYCHAIN] : []),
      ],
    };
  }

  return null;
}

function run(command, args, { secretArgs = [] } = {}) {
  const printable = args
    .map((arg) => (secretArgs.includes(arg) ? '***' : arg))
    .join(' ');
  log.info(`$ ${command} ${printable}`);
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
}

async function findDiskImages(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
    .map((entry) => join(root, entry.name))
    .sort();
}

async function main() {
  if (process.platform !== 'darwin') {
    log.info('Skipping: not macOS.');
    return;
  }

  const diskImages = await findDiskImages(releaseRoot);
  if (diskImages.length === 0) {
    log.warn(`No .dmg artifacts found in ${releaseRoot}. Nothing to staple.`);
    return;
  }

  const credentials = notarytoolCredentials();
  if (!credentials) {
    const message = 'No complete notarytool credential set found.';
    if (notarizationRequired()) {
      throw new Error(`${message} MARKUPRX_REQUIRE_NOTARIZATION is set, refusing to publish unstapled disk images.`);
    }
    log.warn(`${message} Skipping DMG notarization.`);
    return;
  }

  log.info(`Strategy: ${credentials.strategy}`);
  log.info(`Disk images: ${diskImages.length}`);

  // Values that must never reach the log.
  const secretArgs = [
    process.env.APPLE_APP_SPECIFIC_PASSWORD,
    process.env.APPLE_API_ISSUER,
  ].filter(Boolean);

  const failures = [];

  for (const diskImage of diskImages) {
    log.progress(`Notarizing ${basename(diskImage)}`);

    const submitted = run('xcrun', ['notarytool', 'submit', diskImage, ...credentials.args, '--wait'], { secretArgs });
    if (submitted.status !== 0) {
      failures.push(`${basename(diskImage)}: notarytool submit exited ${submitted.status}`);
      continue;
    }

    const stapled = run('xcrun', ['stapler', 'staple', diskImage]);
    if (stapled.status !== 0) {
      failures.push(`${basename(diskImage)}: stapler staple exited ${stapled.status}`);
      continue;
    }

    log.success(`Stapled ${basename(diskImage)}`);
  }

  if (failures.length > 0) {
    throw new Error(`DMG notarization failed:\n  ${failures.join('\n  ')}`);
  }

  log.success('All disk images notarized and stapled.');
}

main().catch((error) => {
  log.error(error.message);
  process.exitCode = 1;
});
