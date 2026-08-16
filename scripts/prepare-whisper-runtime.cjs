const {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const ARCH_NAMES = {
  0: 'ia32',
  1: 'x64',
  2: 'arm',
  3: 'arm64',
  4: 'universal',
};

function sharpRuntimePackages(platform, arch) {
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    return [
      `@img/sharp-darwin-${arch}`,
      `@img/sharp-libvips-darwin-${arch}`,
    ];
  }
  if (platform === 'win32' && ['x64', 'arm64', 'ia32'].includes(arch)) {
    return [`@img/sharp-win32-${arch}`];
  }
  if (platform === 'linux' && ['x64', 'arm64', 'arm'].includes(arch)) {
    return [
      `@img/sharp-linux-${arch}`,
      `@img/sharp-libvips-linux-${arch}`,
    ];
  }
  return [];
}

function whisperBuildConfiguration(platform, arch) {
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    const compilerArch = arch === 'x64' ? 'x86_64' : 'arm64';
    return {
      binaryName: 'main',
      expectedArchitecture: arch,
      makeVariables: [
        `UNAME_M=${compilerArch}`,
        `UNAME_P=${compilerArch}`,
        `CC=xcrun clang -arch ${compilerArch}`,
        `CXX=xcrun clang++ -arch ${compilerArch}`,
      ],
    };
  }
  if (platform === 'win32' && ['x64', 'arm64', 'ia32'].includes(arch)) {
    return { binaryName: 'main.exe', expectedArchitecture: arch, makeVariables: [] };
  }
  if (platform === 'linux' && ['x64', 'arm64', 'arm'].includes(arch)) {
    return { binaryName: 'main', expectedArchitecture: arch, makeVariables: [] };
  }
  return null;
}

function nativeBinaryArchitectures(binary) {
  if (!Buffer.isBuffer(binary) || binary.length < 8) return [];

  const magic = binary.readUInt32LE(0);
  if (magic === 0xfeedface || magic === 0xfeedfacf) {
    const cpuType = binary.readUInt32LE(4);
    if (cpuType === 0x01000007) return ['x64'];
    if (cpuType === 0x0100000c) return ['arm64'];
    if (cpuType === 7) return ['ia32'];
    if (cpuType === 12) return ['arm'];
  }

  if (binary.length >= 20
    && binary[0] === 0x7f
    && binary.subarray(1, 4).toString('ascii') === 'ELF') {
    const littleEndian = binary[5] === 1;
    const machine = littleEndian ? binary.readUInt16LE(18) : binary.readUInt16BE(18);
    if (machine === 0x3e) return ['x64'];
    if (machine === 0xb7) return ['arm64'];
    if (machine === 0x03) return ['ia32'];
    if (machine === 0x28) return ['arm'];
  }

  if (binary.length >= 64 && binary.subarray(0, 2).toString('ascii') === 'MZ') {
    const peOffset = binary.readUInt32LE(0x3c);
    if (peOffset + 6 <= binary.length
      && binary.subarray(peOffset, peOffset + 4).toString('binary') === 'PE\0\0') {
      const machine = binary.readUInt16LE(peOffset + 4);
      if (machine === 0x8664) return ['x64'];
      if (machine === 0xaa64) return ['arm64'];
      if (machine === 0x014c) return ['ia32'];
      if (machine === 0x01c4) return ['arm'];
    }
  }
  return [];
}

function ensureSharpRuntime(appDirectory, platform, arch) {
  const sharpPackagePath = join(appDirectory, 'node_modules', 'sharp', 'package.json');
  const sharpPackage = JSON.parse(readFileSync(sharpPackagePath, 'utf8'));
  const packages = sharpRuntimePackages(platform, arch);
  if (packages.length === 0) {
    console.warn(`[prepare-native-runtime] No Sharp runtime mapping for ${platform}/${arch}.`);
    return;
  }

  const missing = packages.filter((packageName) => {
    const packageDirectory = join(appDirectory, 'node_modules', ...packageName.split('/'));
    const expectedVersion = sharpPackage.optionalDependencies?.[packageName];
    if (!expectedVersion || !existsSync(join(packageDirectory, 'package.json'))) return true;
    try {
      return JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')).version
        !== expectedVersion;
    } catch {
      return true;
    }
  });
  if (missing.length === 0) {
    console.log(`[prepare-native-runtime] Sharp runtime ready for ${platform}/${arch}.`);
    return;
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'markuprx-sharp-runtime-'));
  try {
    writeFileSync(join(temporaryDirectory, 'package.json'), JSON.stringify({
      private: true,
      name: 'markuprx-sharp-runtime',
      version: '1.0.0',
    }));
    const specifications = missing.map((packageName) => {
      const version = sharpPackage.optionalDependencies?.[packageName];
      if (!version) throw new Error(`Sharp does not declare ${packageName}.`);
      return `${packageName}@${version}`;
    });
    console.log(
      `[prepare-native-runtime] Installing ${platform}/${arch} Sharp runtime: ${specifications.join(', ')}`,
    );
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCommand, [
      'install',
      '--no-package-lock',
      '--ignore-scripts',
      '--omit=dev',
      '--force',
      `--os=${platform}`,
      `--cpu=${arch}`,
      ...specifications,
    ], {
      cwd: temporaryDirectory,
      env: {
        ...process.env,
        npm_config_platform: platform,
        npm_config_arch: arch,
      },
      encoding: 'utf8',
      shell: false,
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || result.error?.message || 'unknown npm error')
        .trim()
        .split('\n')
        .slice(-5)
        .join(' ');
      throw new Error(`Unable to install Sharp runtime for ${platform}/${arch}: ${detail}`);
    }

    for (const packageName of missing) {
      const relativeParts = packageName.split('/');
      const source = join(temporaryDirectory, 'node_modules', ...relativeParts);
      const destination = join(appDirectory, 'node_modules', ...relativeParts);
      if (!existsSync(join(source, 'package.json'))) {
        throw new Error(`Installed Sharp runtime is incomplete: ${packageName}.`);
      }
      mkdirSync(dirname(destination), { recursive: true });
      rmSync(destination, { recursive: true, force: true });
      cpSync(source, destination, { recursive: true, force: true });
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Prepare native runtimes before electron-builder copies production dependencies. */
async function prepareNativeRuntime(context) {
  const appDirectory = context.packager?.info?.appDir || context.packager?.projectDir;
  if (!appDirectory) {
    throw new Error('electron-builder did not provide an application directory.');
  }
  const targetPlatform = context.electronPlatformName || process.platform;
  const targetArch = typeof context.arch === 'number'
    ? ARCH_NAMES[context.arch]
    : String(context.arch || process.arch);
  ensureSharpRuntime(appDirectory, targetPlatform, targetArch);

  const whisperBuild = whisperBuildConfiguration(targetPlatform, targetArch);
  if (!whisperBuild) {
    throw new Error(`No Whisper runtime build mapping for ${targetPlatform}/${targetArch}.`);
  }

  const whisperDirectory = join(
    appDirectory,
    'node_modules',
    'whisper-node',
    'lib',
    'whisper.cpp',
  );
  const binaryPath = join(whisperDirectory, whisperBuild.binaryName);
  const existingArchitectures = existsSync(binaryPath)
    ? nativeBinaryArchitectures(readFileSync(binaryPath))
    : [];
  if (existingArchitectures.includes(whisperBuild.expectedArchitecture)) {
    console.log(`[prepare-whisper-runtime] Using existing runtime: ${binaryPath}`);
    return;
  }

  if (existsSync(binaryPath)) {
    console.log(
      `[prepare-whisper-runtime] Rebuilding ${existingArchitectures.join('/') || 'unknown'} runtime for ${targetArch}.`,
    );
  } else {
    console.log(`[prepare-whisper-runtime] Building bundled runtime for ${targetArch}...`);
  }
  const result = spawnSync('make', ['clean', 'main', ...whisperBuild.makeVariables], {
    cwd: whisperDirectory,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const builtArchitectures = existsSync(binaryPath)
    ? nativeBinaryArchitectures(readFileSync(binaryPath))
    : [];
  if (result.status !== 0 || !builtArchitectures.includes(whisperBuild.expectedArchitecture)) {
    const detail = (result.stderr || result.stdout || result.error?.message || 'unknown build error')
      .trim()
      .split('\n')
      .slice(-3)
      .join(' ');
    throw new Error(`Unable to prepare the Whisper runtime: ${detail}`);
  }

  console.log(`[prepare-whisper-runtime] Built runtime: ${binaryPath}`);
}

module.exports = prepareNativeRuntime;
module.exports.sharpRuntimePackages = sharpRuntimePackages;
module.exports.whisperBuildConfiguration = whisperBuildConfiguration;
module.exports.nativeBinaryArchitectures = nativeBinaryArchitectures;
