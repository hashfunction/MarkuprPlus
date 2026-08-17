import { createRequire } from 'node:module';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { nativeBinaryArchitectures } = require('./prepare-whisper-runtime.cjs');
const packageMetadata = require('../package.json');
const arguments_ = process.argv.slice(2);
const dirOnly = arguments_.includes('--dir-only');
const positionalArguments = arguments_.filter((argument) => argument !== '--dir-only');
const unknownOption = positionalArguments.find((argument) => argument.startsWith('-'));
if (unknownOption) throw new Error(`Unknown package verification option: ${unknownOption}`);
if (positionalArguments.length > 1) {
  throw new Error('Package verification accepts at most one release root.');
}
const releaseRoot = resolve(positionalArguments[0] || 'release');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findResourceDirectories(root, depth = 0) {
  if (depth > 5) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (basename(root).toLowerCase() === 'resources'
    && entries.some((entry) => entry.isFile() && entry.name === 'app.asar')) {
    return [root];
  }

  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => findResourceDirectories(join(root, entry.name), depth + 1)));
  return nested.flat();
}

async function findDistributables(root, depth = 0) {
  if (depth > 7) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const distributablePattern = /\.(?:dmg|zip|exe|msi|appimage|deb|rpm|snap)(?:\.blockmap)?$/i;
  const files = entries
    .filter((entry) => entry.isFile() && distributablePattern.test(entry.name))
    .map((entry) => join(root, entry.name));
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory()
      && !entry.isSymbolicLink()
      && !entry.name.endsWith('.app')
      && !entry.name.toLowerCase().endsWith('-unpacked'))
    .map((entry) => findDistributables(join(root, entry.name), depth + 1)));
  return [...files, ...nested.flat()];
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalDistributablePatterns(version) {
  const escapedVersion = escapedRegex(version);
  const suffix = '(?:\\.blockmap)?';
  return [
    new RegExp(`^markuprplus-${escapedVersion}-(?:x64|arm64|universal)\\.dmg${suffix}$`),
    new RegExp(`^MarkuprPlus-${escapedVersion}(?:-(?:x64|arm64|universal))?-mac\\.zip${suffix}$`),
    new RegExp(`^markuprplus-Setup-${escapedVersion}\\.exe${suffix}$`),
    new RegExp(`^MarkuprPlus ${escapedVersion}\\.(?:exe|msi)${suffix}$`),
    new RegExp(`^markuprplus-${escapedVersion}-(?:x86_64|arm64)\\.AppImage${suffix}$`),
    new RegExp(`^markuprplus-${escapedVersion}-(?:amd64|arm64)\\.deb${suffix}$`),
  ];
}

async function assertReleaseArtifacts(root, requireArtifacts) {
  const artifacts = await findDistributables(root);
  const legacy = artifacts.filter((artifact) => /markuprx/i.test(basename(artifact)));
  if (legacy.length > 0) {
    throw new Error(`Legacy-branded distributable is forbidden:\n${legacy.join('\n')}`);
  }

  const canonicalPatterns = canonicalDistributablePatterns(packageMetadata.version);
  const noncanonical = artifacts.filter((artifact) =>
    !canonicalPatterns.some((pattern) => pattern.test(basename(artifact))));
  if (noncanonical.length > 0) {
    throw new Error(
      `Noncanonical MarkuprPlus distributable filename:\n${noncanonical.join('\n')}`,
    );
  }
  if (requireArtifacts && artifacts.length === 0) {
    throw new Error(`No MarkuprPlus distributable artifacts found under ${root}.`);
  }
}

function plistString(plist, key) {
  const match = plist.match(new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]*)<\\/string>`));
  return match?.[1] ?? null;
}

function packagedLayout(resources) {
  const normalized = resources.replaceAll('\\', '/').toLowerCase();
  const layouts = [
    ['mac-universal', /\/mac-universal\/[^/]+\.app\/contents\/resources$/],
    ['mac-arm64', /\/mac-arm64\/[^/]+\.app\/contents\/resources$/],
    ['mac-x64', /\/mac\/[^/]+\.app\/contents\/resources$/],
    ['win-arm64', /\/win-arm64-unpacked\/resources$/],
    ['win-x64', /\/win-unpacked\/resources$/],
    ['linux-arm64', /\/linux-arm64-unpacked\/resources$/],
    ['linux-x64', /\/linux-unpacked\/resources$/],
  ];
  return layouts.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

async function assertPublicPackageLayout(resources) {
  const layout = packagedLayout(resources);

  if (layout?.startsWith('mac-')) {
    const appRoot = dirname(dirname(resources));
    if (basename(appRoot) !== 'MarkuprPlus.app') {
      throw new Error(
        `Packaged macOS application must be named MarkuprPlus.app: ${appRoot}`,
      );
    }
    const executable = join(appRoot, 'Contents', 'MacOS', 'MarkuprPlus');
    if (!(await exists(executable))) {
      throw new Error(`Packaged macOS executable is missing: ${executable}`);
    }

    const plistPath = join(appRoot, 'Contents', 'Info.plist');
    const plist = await readFile(plistPath, 'utf8').catch(() => '');
    if (!plist) throw new Error(`Packaged macOS Info.plist is missing: ${plistPath}`);
    const expectedMetadata = {
      CFBundleDisplayName: 'MarkuprPlus',
      CFBundleName: 'MarkuprPlus',
      CFBundleExecutable: 'MarkuprPlus',
      CFBundleIdentifier: 'com.eddiesanjuan.markuprx',
    };
    for (const [key, expected] of Object.entries(expectedMetadata)) {
      const actual = plistString(plist, key);
      if (actual !== expected) {
        if (key === 'CFBundleIdentifier') {
          throw new Error(
            'Packaged macOS bundle identifier must remain '
            + `com.eddiesanjuan.markuprx; received ${actual ?? 'missing'}.`,
          );
        }
        throw new Error(
          `Packaged macOS ${key} must be ${expected}; received ${actual ?? 'missing'}.`,
        );
      }
    }
    return executable;
  }

  if (layout?.startsWith('win-')) {
    const executable = join(dirname(resources), 'MarkuprPlus.exe');
    if (!(await exists(executable))) {
      throw new Error(`Packaged Windows executable is missing: ${executable}`);
    }
    return executable;
  }

  if (layout?.startsWith('linux-')) {
    const executable = join(dirname(resources), 'MarkuprPlus');
    if (!(await exists(executable))) {
      throw new Error(`Packaged Linux executable is missing: ${executable}`);
    }
    return executable;
  }

  throw new Error(`Unable to determine packaged application layout: ${resources}`);
}

async function packagedAssetFiles(root, depth = 0) {
  if (depth > 3) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(root, entry.name));
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => packagedAssetFiles(join(root, entry.name), depth + 1)));
  return [...files, ...nested.flat()];
}

async function assertRuntimeAssets(resources) {
  const assetsRoot = join(resources, 'assets');
  const assets = await packagedAssetFiles(assetsRoot);
  const trayStates = ['idle', 'recording', 'complete', 'error'];
  const processingStates = [
    'processing',
    'processing-0',
    'processing-1',
    'processing-2',
    'processing-3',
  ];
  const variants = ['', 'Template', '@2x', 'Template@2x'];
  const requiredNames = [...trayStates, ...processingStates]
    .flatMap((state) => variants.map((variant) => `tray-${state}${variant}.png`));
  const requiredNameSet = new Set(requiredNames);
  const nonRuntimeAssets = assets.filter((asset) => {
    const relativePath = relative(assetsRoot, asset).replaceAll('\\', '/');
    return relativePath.includes('/') || !requiredNameSet.has(relativePath);
  });
  if (nonRuntimeAssets.length > 0) {
    throw new Error(
      `Packaged resources contain non-runtime assets: ${nonRuntimeAssets.join('\n')}`,
    );
  }

  const packagedNames = new Set(assets.map((asset) => basename(asset)));
  const missing = requiredNames.filter((name) => !packagedNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Packaged runtime tray assets are missing: ${missing.join(', ')}`);
  }

  const taskbarRoot = join(resources, 'build');
  const taskbarAssets = await packagedAssetFiles(taskbarRoot);
  const requiredTaskbarNames = [
    'overlay-recording.png',
    'overlay-processing.png',
    'toolbar-record.png',
    'toolbar-stop.png',
    'toolbar-screenshot.png',
    'toolbar-settings.png',
  ];
  const requiredTaskbarSet = new Set(requiredTaskbarNames);
  const isWindowsPackage = packagedLayout(resources)?.startsWith('win-') ?? false;
  const nonRuntimeTaskbarAssets = taskbarAssets.filter((asset) => {
    const relativePath = relative(taskbarRoot, asset).replaceAll('\\', '/');
    return !isWindowsPackage
      || relativePath.includes('/')
      || !requiredTaskbarSet.has(relativePath);
  });
  if (nonRuntimeTaskbarAssets.length > 0) {
    throw new Error(
      'Packaged resources contain non-runtime taskbar assets: '
      + nonRuntimeTaskbarAssets.join('\n'),
    );
  }
  if (!isWindowsPackage) return;

  const packagedTaskbarNames = new Set(taskbarAssets.map((asset) => basename(asset)));
  const missingTaskbar = requiredTaskbarNames.filter((name) =>
    !packagedTaskbarNames.has(name));
  if (missingTaskbar.length > 0) {
    throw new Error(
      `Packaged runtime taskbar assets are missing: ${missingTaskbar.join(', ')}`,
    );
  }
}

function expectedNativeRuntime(resources) {
  const layout = packagedLayout(resources);
  if (layout === 'mac-universal') {
    return {
      architectures: ['x64', 'arm64'],
      sharp: [
        { addon: 'sharp-darwin-x64', arch: 'x64', libvips: 'sharp-libvips-darwin-x64' },
        { addon: 'sharp-darwin-arm64', arch: 'arm64', libvips: 'sharp-libvips-darwin-arm64' },
      ],
    };
  }
  if (layout === 'mac-arm64') {
    return {
      architectures: ['arm64'],
      sharp: [{
        addon: 'sharp-darwin-arm64',
        arch: 'arm64',
        libvips: 'sharp-libvips-darwin-arm64',
      }],
    };
  }
  if (layout === 'mac-x64') {
    return {
      architectures: ['x64'],
      sharp: [{
        addon: 'sharp-darwin-x64',
        arch: 'x64',
        libvips: 'sharp-libvips-darwin-x64',
      }],
    };
  }
  if (layout === 'win-arm64') {
    return { architectures: ['arm64'], sharp: [{ addon: 'sharp-win32-arm64', arch: 'arm64' }] };
  }
  if (layout === 'win-x64') {
    return { architectures: ['x64'], sharp: [{ addon: 'sharp-win32-x64', arch: 'x64' }] };
  }
  if (layout === 'linux-arm64') {
    return {
      architectures: ['arm64'],
      sharp: [{ addon: 'sharp-linux-arm64', arch: 'arm64', libvips: 'sharp-libvips-linux-arm64' }],
    };
  }
  if (layout === 'linux-x64') {
    return {
      architectures: ['x64'],
      sharp: [{ addon: 'sharp-linux-x64', arch: 'x64', libvips: 'sharp-libvips-linux-x64' }],
    };
  }
  throw new Error(`Unable to determine packaged runtime architecture: ${resources}`);
}

async function containsNativeAddon(root, depth = 0) {
  if (depth > 5) return false;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.node'))) return true;
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => containsNativeAddon(join(root, entry.name), depth + 1)));
  return nested.some(Boolean);
}

async function assertArchitectures(path, expectedArchitectures) {
  const architectures = nativeBinaryArchitectures(await readFile(path));
  const missingArchitectures = expectedArchitectures.filter((architecture) =>
    !architectures.includes(architecture));
  if (missingArchitectures.length > 0) {
    throw new Error(
      `Packaged native runtime has wrong architecture: ${path}\n`
      + `Expected ${expectedArchitectures.join(' + ')}; `
      + `found ${architectures.join(', ') || 'unknown'}.`,
    );
  }
}

async function findNativeAddons(root, depth = 0) {
  if (depth > 5) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.node'))
    .map((entry) => join(root, entry.name));
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => findNativeAddons(join(root, entry.name), depth + 1)));
  return [...files, ...nested.flat()];
}

async function findNativeLibraries(root, depth = 0) {
  if (depth > 5) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile()
      && (entry.name.endsWith('.dylib') || /\.so(?:\.\d+)*$/.test(entry.name)))
    .map((entry) => join(root, entry.name));
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => findNativeLibraries(join(root, entry.name), depth + 1)));
  return [...files, ...nested.flat()];
}

await assertReleaseArtifacts(releaseRoot, !dirOnly);
const resourceDirectories = await findResourceDirectories(releaseRoot);
if (resourceDirectories.length === 0) {
  throw new Error(`No packaged MarkuprPlus runtime found under ${releaseRoot}.`);
}

for (const resources of resourceDirectories) {
  const publicExecutable = await assertPublicPackageLayout(resources);
  await assertRuntimeAssets(resources);
  const unpacked = join(resources, 'app.asar.unpacked', 'node_modules');
  const keytar = join(unpacked, 'keytar', 'build', 'Release', 'keytar.node');
  const nativeRuntime = expectedNativeRuntime(resources);
  const sharpRuntimes = nativeRuntime.sharp.map((runtime) => ({
    ...runtime,
    addonRoot: join(unpacked, '@img', runtime.addon),
    libvipsRoot: runtime.libvips ? join(unpacked, '@img', runtime.libvips) : null,
  }));
  const whisperRoot = join(unpacked, 'whisper-node', 'lib', 'whisper.cpp');
  const whisperBinary = (await exists(join(whisperRoot, 'main')))
    ? join(whisperRoot, 'main')
    : join(whisperRoot, 'main.exe');
  const required = [keytar, whisperBinary];
  for (const runtime of sharpRuntimes) {
    required.push(runtime.addonRoot);
    if (runtime.libvipsRoot) required.push(runtime.libvipsRoot);
  }
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length > 0) {
    throw new Error(`Packaged native runtime is incomplete:\n${missing.join('\n')}`);
  }
  await assertArchitectures(publicExecutable, nativeRuntime.architectures);
  await assertArchitectures(keytar, nativeRuntime.architectures);
  await assertArchitectures(whisperBinary, nativeRuntime.architectures);
  for (const runtime of sharpRuntimes) {
    if (!(await containsNativeAddon(runtime.addonRoot))) {
      throw new Error(`Packaged Sharp runtime has no native addon: ${runtime.addonRoot}`);
    }
    const sharpAddons = await findNativeAddons(runtime.addonRoot);
    for (const sharpAddon of sharpAddons) {
      await assertArchitectures(sharpAddon, [runtime.arch]);
    }
    if (runtime.libvipsRoot) {
      const libvipsLibraries = await findNativeLibraries(runtime.libvipsRoot);
      if (libvipsLibraries.length === 0) {
        throw new Error(
          `Packaged Sharp libvips runtime has no native library: ${runtime.libvipsRoot}`,
        );
      }
      for (const library of libvipsLibraries) {
        await assertArchitectures(library, [runtime.arch]);
      }
    }
  }

  console.log(
    `Verified packaged native runtime: ${resources} `
    + `(${sharpRuntimes.map((runtime) => runtime.addon).join(', ')})`,
  );
}
