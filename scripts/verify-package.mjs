import { createRequire } from 'node:module';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { nativeBinaryArchitectures } = require('./prepare-whisper-runtime.cjs');
const releaseRoot = resolve(process.argv[2] || 'release');

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

function expectedSharpRuntime(resources) {
  const normalized = resources.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('/mac-arm64/')) {
    return { addon: 'sharp-darwin-arm64', arch: 'arm64', libvips: 'sharp-libvips-darwin-arm64' };
  }
  if (normalized.includes('/mac/')) {
    return { addon: 'sharp-darwin-x64', arch: 'x64', libvips: 'sharp-libvips-darwin-x64' };
  }
  if (normalized.includes('/win-arm64-unpacked/')) {
    return { addon: 'sharp-win32-arm64', arch: 'arm64' };
  }
  if (normalized.includes('/win')) {
    return { addon: 'sharp-win32-x64', arch: 'x64' };
  }
  if (normalized.includes('/linux-arm64-unpacked/')) {
    return { addon: 'sharp-linux-arm64', arch: 'arm64', libvips: 'sharp-libvips-linux-arm64' };
  }
  if (normalized.includes('/linux')) {
    return { addon: 'sharp-linux-x64', arch: 'x64', libvips: 'sharp-libvips-linux-x64' };
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

async function assertArchitecture(path, expectedArchitecture) {
  const architectures = nativeBinaryArchitectures(await readFile(path));
  if (!architectures.includes(expectedArchitecture)) {
    throw new Error(
      `Packaged native runtime has wrong architecture: ${path}\n`
      + `Expected ${expectedArchitecture}; found ${architectures.join(', ') || 'unknown'}.`,
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

const resourceDirectories = await findResourceDirectories(releaseRoot);
if (resourceDirectories.length === 0) {
  throw new Error(`No packaged MarkuprX runtime found under ${releaseRoot}.`);
}

for (const resources of resourceDirectories) {
  const unpacked = join(resources, 'app.asar.unpacked', 'node_modules');
  const keytar = join(unpacked, 'keytar', 'build', 'Release', 'keytar.node');
  const sharpRuntime = expectedSharpRuntime(resources);
  const sharpAddonRoot = join(unpacked, '@img', sharpRuntime.addon);
  const sharpLibvipsRoot = sharpRuntime.libvips
    ? join(unpacked, '@img', sharpRuntime.libvips)
    : null;
  const whisperRoot = join(unpacked, 'whisper-node', 'lib', 'whisper.cpp');
  const whisperBinary = (await exists(join(whisperRoot, 'main')))
    ? join(whisperRoot, 'main')
    : join(whisperRoot, 'main.exe');
  const required = [keytar, whisperBinary, sharpAddonRoot];
  if (sharpLibvipsRoot) required.push(sharpLibvipsRoot);
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length > 0) {
    throw new Error(`Packaged native runtime is incomplete:\n${missing.join('\n')}`);
  }
  if (!(await containsNativeAddon(sharpAddonRoot))) {
    throw new Error(`Packaged Sharp runtime has no native addon: ${sharpAddonRoot}`);
  }
  await assertArchitecture(keytar, sharpRuntime.arch);
  await assertArchitecture(whisperBinary, sharpRuntime.arch);
  const sharpAddons = await findNativeAddons(sharpAddonRoot);
  for (const sharpAddon of sharpAddons) {
    await assertArchitecture(sharpAddon, sharpRuntime.arch);
  }

  console.log(
    `Verified packaged native runtime: ${resources} (${sharpRuntime.addon})`,
  );
}
