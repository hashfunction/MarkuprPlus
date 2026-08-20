/**
 * verify-signing.mjs
 *
 * Proves that a packaged macOS release will install and launch on a machine
 * that has never seen it before. scripts/verify-package.mjs checks the layout
 * of the artifacts; this checks their provenance.
 *
 * For every .app bundle under the release root:
 *   - the signature is valid and unbroken (codesign --verify --deep --strict)
 *   - it is signed by a Developer ID Application certificate, not an
 *     Apple Development or Apple Distribution certificate
 *   - the hardened runtime is enabled and a Team ID is embedded
 *   - every loose Mach-O binary under Contents/Resources is signed, which is
 *     where the unpacked whisper.cpp runtime and native addons live and where
 *     `--deep` does not look
 *   - a notarization ticket is stapled (xcrun stapler validate)
 *   - Gatekeeper accepts it as notarized (spctl --assess)
 *
 * For every .dmg under the release root:
 *   - a notarization ticket is stapled
 *   - Gatekeeper accepts it for opening
 *
 * Usage: node scripts/verify-signing.mjs [releaseRoot]
 *
 * Exits non-zero on the first class of failure so a release pipeline cannot
 * publish an artifact that Gatekeeper would block.
 */

import { spawnSync } from 'node:child_process';
import { open, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative, basename } from 'node:path';

const releaseRoot = resolve(process.argv[2] || 'release');

const MACH_O_MAGIC = new Set([
  0xfeedface, // 32-bit
  0xfeedfacf, // 64-bit
  0xcefaedfe, // 32-bit, byte swapped
  0xcffaedfe, // 64-bit, byte swapped
  0xcafebabe, // universal
  0xbebafeca, // universal, byte swapped
]);

const problems = [];
const notes = [];

function fail(artifact, message) {
  problems.push(`${artifact}: ${message}`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    // codesign and spctl report on stderr; stapler reports on stdout.
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

async function isMachO(path) {
  let handle;
  try {
    handle = await open(path, 'r');
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4), 0, 4, 0);
    if (bytesRead < 4) return false;
    return MACH_O_MAGIC.has(buffer.readUInt32BE(0)) || MACH_O_MAGIC.has(buffer.readUInt32LE(0));
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

async function walkFiles(root, depth = 0) {
  if (depth > 12) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...await walkFiles(path, depth + 1));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

async function findByExtension(root, extension, depth = 0) {
  if (depth > 6) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.name.endsWith(extension)) {
      found.push(path);
      continue; // Do not descend into a matched bundle.
    }
    if (entry.isDirectory()) {
      found.push(...await findByExtension(path, extension, depth + 1));
    }
  }
  return found.sort();
}

/**
 * Loose Mach-O binaries in Resources are not "nested code" as far as
 * `codesign --deep` is concerned, so they have to be verified individually.
 * An unsigned one here is the classic cause of a notarization rejection.
 */
async function verifyResourceBinaries(appPath, label) {
  const resources = join(appPath, 'Contents', 'Resources');
  const files = await walkFiles(resources);
  const unsigned = [];
  let checked = 0;

  for (const file of files) {
    const stats = await lstat(file).catch(() => null);
    if (!stats) continue;
    // Only executables and loadable images can be Mach-O; skip the rest cheaply.
    const executable = (stats.mode & 0o111) !== 0;
    const loadable = /\.(node|dylib|so)$/.test(file);
    if (!executable && !loadable) continue;
    if (!await isMachO(file)) continue;

    checked += 1;
    const { status } = runCapture('codesign', ['--verify', '--strict', file]);
    if (status !== 0) unsigned.push(relative(appPath, file));
  }

  if (unsigned.length > 0) {
    fail(label, `${unsigned.length} unsigned Mach-O binaries under Contents/Resources:\n    ${unsigned.join('\n    ')}`);
    return;
  }

  notes.push(`${label}: ${checked} resource binaries signed`);
}

async function verifyApp(appPath) {
  const label = relative(releaseRoot, appPath) || basename(appPath);
  console.log(`\n--- ${label} ---`);

  const verified = runCapture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  if (verified.status !== 0) {
    fail(label, `codesign --verify --deep --strict failed:\n    ${verified.output.trim()}`);
    return;
  }
  console.log('  signature valid');

  const displayed = runCapture('codesign', ['--display', '--verbose=4', appPath]);
  const lines = displayed.output.split('\n').map((line) => line.trim());
  const authorities = lines
    .filter((line) => line.startsWith('Authority='))
    .map((line) => line.slice('Authority='.length));

  const developerId = authorities.find((authority) => authority.startsWith('Developer ID Application'));
  if (!developerId) {
    fail(label, `not signed by a Developer ID Application certificate (found: ${authorities[0] || 'none'}).\n`
      + '    Apple Development and Apple Distribution certificates cannot be notarized for direct distribution.');
  } else {
    console.log(`  ${developerId}`);
  }

  const flags = lines.find((line) => line.startsWith('CodeDirectory ')) || '';
  if (!/flags=.*runtime/.test(flags)) {
    fail(label, 'the hardened runtime is not enabled; Apple rejects notarization without it.');
  } else {
    console.log('  hardened runtime enabled');
  }

  const teamIdentifier = lines.find((line) => line.startsWith('TeamIdentifier='));
  if (!teamIdentifier || teamIdentifier.endsWith('not set')) {
    fail(label, 'no Team Identifier is embedded in the signature.');
  } else {
    console.log(`  ${teamIdentifier}`);
  }

  await verifyResourceBinaries(appPath, label);

  const stapled = runCapture('xcrun', ['stapler', 'validate', appPath]);
  if (stapled.status !== 0) {
    fail(label, `no notarization ticket is stapled:\n    ${stapled.output.trim()}`);
  } else {
    console.log('  notarization ticket stapled');
  }

  const assessed = runCapture('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  if (assessed.status !== 0 || !/accepted/.test(assessed.output)) {
    fail(label, `Gatekeeper rejected the app:\n    ${assessed.output.trim()}`);
  } else if (!/source=Notarized Developer ID/.test(assessed.output)) {
    fail(label, `Gatekeeper accepted the app but not as notarized:\n    ${assessed.output.trim()}`);
  } else {
    console.log('  Gatekeeper: accepted, source=Notarized Developer ID');
  }
}

function verifyDiskImage(diskImagePath) {
  const label = relative(releaseRoot, diskImagePath) || basename(diskImagePath);
  console.log(`\n--- ${label} ---`);

  const stapled = runCapture('xcrun', ['stapler', 'validate', diskImagePath]);
  if (stapled.status !== 0) {
    fail(label, `no notarization ticket is stapled to the disk image:\n    ${stapled.output.trim()}\n`
      + '    Run: node scripts/notarize-dmg.mjs');
  } else {
    console.log('  notarization ticket stapled');
  }

  const assessed = runCapture('spctl', [
    '--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', diskImagePath,
  ]);
  if (assessed.status !== 0 || !/accepted/.test(assessed.output)) {
    fail(label, `Gatekeeper rejected the disk image:\n    ${assessed.output.trim()}`);
  } else {
    console.log('  Gatekeeper: accepted');
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('[verify-signing] Skipping: macOS signature verification requires macOS.');
    return;
  }

  console.log(`[verify-signing] Release root: ${releaseRoot}`);

  const apps = await findByExtension(releaseRoot, '.app');
  const diskImages = await findByExtension(releaseRoot, '.dmg');

  if (apps.length === 0 && diskImages.length === 0) {
    throw new Error(`No .app or .dmg artifacts found under ${releaseRoot}. Package the app before verifying signatures.`);
  }

  for (const app of apps) await verifyApp(app);
  for (const diskImage of diskImages) verifyDiskImage(diskImage);

  console.log('');
  console.log('='.repeat(60));

  if (problems.length > 0) {
    console.error(`[verify-signing] ${problems.length} problem(s) found:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    console.error('These artifacts would be blocked by Gatekeeper on a user machine.');
    throw new Error('macOS signing verification failed.');
  }

  for (const note of notes) console.log(`[verify-signing] ${note}`);
  console.log(`[verify-signing] OK: ${apps.length} app bundle(s) and ${diskImages.length} disk image(s) are signed, notarized, and stapled.`);
}

main().catch((error) => {
  console.error(`[verify-signing] ${error.message}`);
  process.exitCode = 1;
});
