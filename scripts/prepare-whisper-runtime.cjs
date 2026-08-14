const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

/** Build whisper.cpp before electron-builder copies production dependencies. */
module.exports = async function prepareWhisperRuntime(context) {
  const appDirectory = context.packager?.info?.appDir || context.packager?.projectDir;
  if (!appDirectory) {
    throw new Error('electron-builder did not provide an application directory.');
  }
  const whisperDirectory = join(
    appDirectory,
    'node_modules',
    'whisper-node',
    'lib',
    'whisper.cpp',
  );
  const binaryPath = join(whisperDirectory, process.platform === 'win32' ? 'main.exe' : 'main');
  if (existsSync(binaryPath)) {
    console.log(`[prepare-whisper-runtime] Using existing runtime: ${binaryPath}`);
    return;
  }

  console.log('[prepare-whisper-runtime] Building bundled whisper.cpp runtime...');
  const result = spawnSync('make', [], {
    cwd: whisperDirectory,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || !existsSync(binaryPath)) {
    const detail = (result.stderr || result.stdout || result.error?.message || 'unknown build error')
      .trim()
      .split('\n')
      .slice(-3)
      .join(' ');
    throw new Error(`Unable to prepare the Whisper runtime: ${detail}`);
  }

  console.log(`[prepare-whisper-runtime] Built runtime: ${binaryPath}`);
};
