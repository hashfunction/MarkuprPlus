/**
 * notarize.cjs
 *
 * Apple notarization hook for MarkuprPlus. electron-builder invokes this from
 * `afterSign`, once the .app bundle has been code signed and before the DMG and
 * ZIP artifacts are assembled. `@electron/notarize` submits the bundle to Apple
 * and staples the resulting ticket to it, so every artifact built afterwards
 * carries a stapled app.
 *
 * Credentials are resolved from the first complete set of:
 *
 *   1. App Store Connect API key
 *        APPLE_API_KEY      - path to the .p8 private key
 *        APPLE_API_KEY_ID   - key ID
 *        APPLE_API_ISSUER   - issuer UUID (team keys only)
 *   2. Apple ID + app-specific password
 *        APPLE_ID
 *        APPLE_APP_SPECIFIC_PASSWORD
 *        APPLE_TEAM_ID
 *   3. A `notarytool store-credentials` keychain profile
 *        APPLE_KEYCHAIN_PROFILE
 *        APPLE_KEYCHAIN       - optional keychain path
 *
 * Set MARKUPRX_REQUIRE_NOTARIZATION=1 to make missing credentials, a missing
 * Developer ID signature, or a failed submission fail the build. The release
 * pipeline sets it so a tagged release can never silently publish an
 * unnotarized app.
 *
 * @see https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
 */

const { notarize } = require('@electron/notarize');
const { spawnSync } = require('node:child_process');
const path = require('path');
const fs = require('fs');

// Logging utilities
const log = {
  info: (msg) => console.log(`[notarize] INFO: ${msg}`),
  progress: (msg) => console.log(`[notarize] >>> ${msg}`),
  success: (msg) => console.log(`[notarize] SUCCESS: ${msg}`),
  warn: (msg) => console.warn(`[notarize] WARN: ${msg}`),
  error: (msg) => console.error(`[notarize] ERROR: ${msg}`),
  divider: () => console.log('='.repeat(60)),
};

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * True when the build must not continue unless the app is notarized.
 */
function notarizationRequired() {
  const flag = String(process.env.MARKUPRX_REQUIRE_NOTARIZATION || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * Resolve the first complete set of notarytool credentials.
 * Returns null when no strategy is fully configured.
 */
function resolveCredentials() {
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
    if (!fs.existsSync(APPLE_API_KEY)) {
      throw new Error(`APPLE_API_KEY does not point at an existing .p8 key: ${APPLE_API_KEY}`);
    }
    return {
      strategy: 'App Store Connect API key',
      describe: `key ${APPLE_API_KEY_ID}`,
      options: {
        appleApiKey: APPLE_API_KEY,
        appleApiKeyId: APPLE_API_KEY_ID,
        // Individual keys must omit the issuer or Apple returns 401.
        ...(APPLE_API_ISSUER ? { appleApiIssuer: APPLE_API_ISSUER } : {}),
      },
    };
  }

  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return {
      strategy: 'Apple ID + app-specific password',
      describe: `${APPLE_ID.replace(/(.{3}).*(@.*)/, '$1***$2')} (team ${APPLE_TEAM_ID})`,
      options: {
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID,
      },
    };
  }

  if (APPLE_KEYCHAIN_PROFILE) {
    return {
      strategy: 'notarytool keychain profile',
      describe: APPLE_KEYCHAIN_PROFILE,
      options: {
        keychainProfile: APPLE_KEYCHAIN_PROFILE,
        ...(APPLE_KEYCHAIN ? { keychain: APPLE_KEYCHAIN } : {}),
      },
    };
  }

  return null;
}

/**
 * Read the signing authorities off a bundle. Apple rejects anything that is not
 * signed by a Developer ID Application certificate, so catching it here turns a
 * slow, opaque server-side rejection into an immediate, explicit failure.
 */
function signingAuthorities(appPath) {
  const result = spawnSync('codesign', ['--display', '--verbose=4', appPath], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return `${result.stderr || ''}`
    .split('\n')
    .filter((line) => line.startsWith('Authority='))
    .map((line) => line.slice('Authority='.length).trim());
}

function assertDeveloperIdSignature(appPath) {
  const authorities = signingAuthorities(appPath);

  if (authorities.length === 0) {
    throw new Error(
      `${path.basename(appPath)} is not code signed. Notarization requires a Developer ID Application signature.`,
    );
  }

  const developerId = authorities.find((authority) => authority.startsWith('Developer ID Application'));
  if (!developerId) {
    throw new Error(
      `${path.basename(appPath)} is signed by "${authorities[0]}", which Apple will not notarize.\n`
      + 'Direct distribution requires a "Developer ID Application" certificate. '
      + '"Apple Development" and "Apple Distribution" certificates are only valid for local runs and App Store submission.',
    );
  }

  log.info(`Signed by: ${developerId}`);
}

/**
 * Explain a missing-credential situation, then either fail or skip.
 */
function handleMissingCredentials() {
  const message = 'No complete notarytool credential set found.';

  log.info('Configure one of the following credential sets:');
  log.info('  APPLE_API_KEY + APPLE_API_KEY_ID [+ APPLE_API_ISSUER]');
  log.info('  APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID');
  log.info('  APPLE_KEYCHAIN_PROFILE');
  log.info('');
  log.info('Get an app-specific password at: https://appleid.apple.com/account/manage');

  if (notarizationRequired()) {
    log.error(message);
    throw new Error(`${message} MARKUPRX_REQUIRE_NOTARIZATION is set, refusing to produce an unnotarized build.`);
  }

  log.warn(`${message} Skipping notarization.`);
  log.warn('The resulting build is for local testing only; Gatekeeper will block it on other machines.');
}

/**
 * Main notarization function called by electron-builder afterSign hook
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  log.divider();
  log.info('MarkuprPlus Notarization');
  log.divider();

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') {
    log.info('Skipping: not macOS platform');
    return;
  }

  const credentials = resolveCredentials();
  if (!credentials) {
    handleMissingCredentials();
    return;
  }

  log.info(`Strategy: ${credentials.strategy}`);
  log.info(`Identity: ${credentials.describe}`);
  log.info('');

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // Verify app exists
  if (!fs.existsSync(appPath)) {
    log.error(`App bundle not found: ${appPath}`);
    throw new Error(`App bundle not found: ${appPath}`);
  }

  assertDeveloperIdSignature(appPath);

  log.divider();
  log.progress(`Submitting ${path.basename(appPath)} to Apple`);
  log.info(`Full path: ${appPath}`);
  log.info('This usually takes 2-10 minutes.');
  log.divider();

  const startTime = Date.now();

  try {
    // notarize() waits for Apple's verdict and staples the ticket to the bundle.
    await notarize({ appPath, ...credentials.options });
  } catch (error) {
    log.error(`Failed to notarize ${path.basename(appPath)}`);
    log.error(error.message);
    log.info('');
    log.info('Troubleshooting tips:');
    log.info('  1. Verify the Apple ID is enrolled in the Apple Developer Program');
    log.info('  2. Regenerate the app-specific password at https://appleid.apple.com');
    log.info('  3. Ensure APPLE_TEAM_ID matches the Developer ID certificate');
    log.info('  4. Run `xcrun notarytool history` to inspect recent submissions');
    log.info('  5. Run `xcrun notarytool log <submission-id>` for per-file rejection detail');
    throw error;
  }

  log.divider();
  log.success(`Notarized and stapled ${path.basename(appPath)} in ${formatDuration(Date.now() - startTime)}`);
  log.divider();
};
