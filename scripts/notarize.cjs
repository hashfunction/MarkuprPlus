/**
 * notarize.js
 *
 * Apple Notarization script for MarkuprPlus
 * This script runs automatically after code signing via electron-builder
 *
 * Handles notarization for:
 *   - .app bundles (main application)
 *   - .dmg files (disk image installers)
 *   - .zip files (compressed archives)
 *
 * Required Environment Variables:
 *   APPLE_ID                    - Your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD - App-specific password from appleid.apple.com
 *   APPLE_TEAM_ID               - Your Apple Developer Team ID
 *
 * @see https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
 */

const { notarize } = require('@electron/notarize');
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
 * Check if required environment variables are set
 */
function checkCredentials() {
  const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
    };
  }

  return { valid: true, missing: [] };
}

/**
 * Notarize a single artifact
 */
async function notarizeArtifact(artifactPath, appBundleId) {
  log.progress(`Notarizing: ${path.basename(artifactPath)}`);
  log.info(`Full path: ${artifactPath}`);

  const startTime = Date.now();

  try {
    await notarize({
      appBundleId,
      appPath: artifactPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    const duration = formatDuration(Date.now() - startTime);
    log.success(`Notarized ${path.basename(artifactPath)} in ${duration}`);
    return true;
  } catch (error) {
    log.error(`Failed to notarize ${path.basename(artifactPath)}`);
    log.error(error.message);
    return false;
  }
}

/**
 * Main notarization function called by electron-builder afterSign hook
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  const appBundleId = 'com.eddiesanjuan.markuprx';

  log.divider();
  log.info('MarkuprPlus Notarization');
  log.divider();

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') {
    log.info('Skipping: not macOS platform');
    return;
  }

  // Check credentials
  const credentials = checkCredentials();
  if (!credentials.valid) {
    log.warn('Skipping: missing credentials');
    log.info(`Missing: ${credentials.missing.join(', ')}`);
    log.info('');
    log.info('To enable notarization, set these environment variables:');
    log.info('  export APPLE_ID="your@email.com"');
    log.info('  export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"');
    log.info('  export APPLE_TEAM_ID="XXXXXXXXXX"');
    log.info('');
    log.info('Get an app-specific password at: https://appleid.apple.com/account/manage');
    return;
  }

  log.info(`Team ID: ${process.env.APPLE_TEAM_ID}`);
  log.info(`Apple ID: ${process.env.APPLE_ID.replace(/(.{3}).*(@.*)/, '$1***$2')}`);
  log.info('');

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // Verify app exists
  if (!fs.existsSync(appPath)) {
    log.error(`App bundle not found: ${appPath}`);
    throw new Error(`App bundle not found: ${appPath}`);
  }

  const totalStartTime = Date.now();
  const results = [];

  // Step 1: Notarize the .app bundle
  log.divider();
  log.progress('Step 1/1: Notarizing app bundle');
  log.divider();

  const appResult = await notarizeArtifact(appPath, appBundleId);
  results.push({ artifact: '.app bundle', success: appResult });

  // Summary
  log.divider();
  log.info('Notarization Summary');
  log.divider();

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(({ artifact, success }) => {
    const status = success ? 'OK' : 'FAILED';
    console.log(`  [${status}] ${artifact}`);
  });

  log.info('');
  log.info(`Total: ${successful} succeeded, ${failed} failed`);
  log.info(`Duration: ${formatDuration(Date.now() - totalStartTime)}`);
  log.divider();

  if (failed > 0) {
    log.error('Some artifacts failed notarization');
    log.info('');
    log.info('Troubleshooting tips:');
    log.info('  1. Verify your Apple ID is enrolled in the Developer Program');
    log.info('  2. Generate a new app-specific password at https://appleid.apple.com');
    log.info('  3. Ensure your Team ID matches your Developer account');
    log.info('  4. Check that code signing succeeded before notarization');
    log.info('  5. Run `xcrun notarytool history` to see submission status');
    throw new Error('Notarization failed');
  }

  log.success('All notarization complete!');
};
