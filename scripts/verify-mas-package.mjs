import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REQUIRED_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.network.client',
  'com.apple.security.device.audio-input',
  'com.apple.security.files.user-selected.read-write',
];

export function parseTrueEntitlements(plist) {
  const keys = [];
  const pattern = /<key>([^<]+)<\/key>\s*<true\s*\/>/g;
  for (const match of plist.matchAll(pattern)) keys.push(match[1]);
  return keys;
}

export function validateMasEvidence(evidence) {
  const problems = [];
  if (evidence.bundleIdentifier !== 'com.eddiesanjuan.markuprx') {
    problems.push(`Unexpected bundle identifier: ${evidence.bundleIdentifier || 'missing'}.`);
  }
  if (evidence.displayName !== 'MarkuprPlus') {
    problems.push(`Unexpected display name: ${evidence.displayName || 'missing'}.`);
  }
  if (!evidence.architectures.includes('x86_64')
    || !evidence.architectures.includes('arm64')) {
    problems.push('MAS bundle must contain x86_64 and arm64 architectures.');
  }
  for (const entitlement of REQUIRED_ENTITLEMENTS) {
    if (!evidence.trueEntitlements.has(entitlement)) {
      problems.push(`Missing true entitlement: ${entitlement}`);
    }
  }
  if (evidence.hasUpdaterMetadata) {
    problems.push('MAS bundle must not contain app-update.yml.');
  }
  if (!evidence.hasEmbeddedProfile) {
    problems.push('MAS bundle must contain embedded.provisionprofile.');
  }
  if (!evidence.signatureValid) {
    problems.push('MAS bundle signature is invalid.');
  }
  return problems;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findApps(root, depth = 0) {
  if (depth > 6) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const apps = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      apps.push(path);
    } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
      apps.push(...await findApps(path, depth + 1));
    }
  }
  return apps;
}

async function containsFile(root, wanted, depth = 0) {
  if (depth > 10) return false;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isFile() && entry.name === wanted)) return true;
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => containsFile(join(root, entry.name), wanted, depth + 1)));
  return nested.some(Boolean);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function plistValue(infoPath, key) {
  const result = capture('plutil', ['-extract', key, 'raw', '-o', '-', infoPath]);
  return result.status === 0 ? result.output : '';
}

async function gatherEvidence(appPath) {
  const infoPath = join(appPath, 'Contents', 'Info.plist');
  const executableName = plistValue(infoPath, 'CFBundleExecutable');
  const executablePath = join(appPath, 'Contents', 'MacOS', executableName);
  const architectureResult = capture('lipo', ['-archs', executablePath]);
  const entitlementResult = capture('codesign', ['--display', '--entitlements', ':-', appPath]);
  const signatureResult = capture('codesign', ['--verify', '--deep', '--strict', appPath]);
  const xmlStart = entitlementResult.output.indexOf('<?xml');
  const entitlementPlist = xmlStart >= 0
    ? entitlementResult.output.slice(xmlStart)
    : entitlementResult.output;
  return {
    bundleIdentifier: plistValue(infoPath, 'CFBundleIdentifier'),
    displayName: plistValue(infoPath, 'CFBundleDisplayName')
      || plistValue(infoPath, 'CFBundleName'),
    architectures: architectureResult.status === 0
      ? architectureResult.output.split(/\s+/).filter(Boolean)
      : [],
    trueEntitlements: new Set(parseTrueEntitlements(entitlementPlist)),
    hasUpdaterMetadata: await containsFile(appPath, 'app-update.yml'),
    hasEmbeddedProfile: await exists(join(appPath, 'Contents', 'embedded.provisionprofile')),
    signatureValid: signatureResult.status === 0,
  };
}

export async function verifyMasPackage(releaseRoot) {
  const root = resolve(releaseRoot);
  const apps = await findApps(root);
  if (apps.length !== 1) {
    throw new Error(`Expected exactly one MAS .app under ${root}; found ${apps.length}.`);
  }
  const evidence = await gatherEvidence(apps[0]);
  const problems = validateMasEvidence(evidence);
  if (problems.length > 0) {
    throw new Error(`Mac App Store package verification failed:\n- ${problems.join('\n- ')}`);
  }
  return { appPath: apps[0], evidence };
}

async function main() {
  const root = process.argv[2] || 'release-mas';
  const result = await verifyMasPackage(root);
  console.log(`[verify-mas] OK: ${basename(result.appPath)} is a signed universal sandbox bundle.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`[verify-mas] ${error.message}`);
    process.exitCode = 1;
  });
}
