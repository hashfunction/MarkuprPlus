import { access, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

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

const resourceDirectories = await findResourceDirectories(releaseRoot);
if (resourceDirectories.length === 0) {
  throw new Error(`No packaged MarkuprX runtime found under ${releaseRoot}.`);
}

for (const resources of resourceDirectories) {
  const unpacked = join(resources, 'app.asar.unpacked', 'node_modules');
  const keytar = join(unpacked, 'keytar', 'build', 'Release', 'keytar.node');
  const whisperRoot = join(unpacked, 'whisper-node', 'lib', 'whisper.cpp');
  const whisperBinary = (await exists(join(whisperRoot, 'main')))
    ? join(whisperRoot, 'main')
    : join(whisperRoot, 'main.exe');
  const required = [keytar, whisperBinary];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length > 0) {
    throw new Error(`Packaged native runtime is incomplete:\n${missing.join('\n')}`);
  }

  console.log(`Verified packaged native runtime: ${resources}`);
}
