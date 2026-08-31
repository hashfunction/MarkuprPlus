import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'markuprplus-package-verifier-'));
  fixtures.push(root);
  return root;
}

function verify(root: string, options: { artifacts?: boolean } = {}) {
  const args = ['scripts/verify-package.mjs'];
  if (!options.artifacts) args.push('--dir-only');
  args.push(root);
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

const trayStates = ['idle', 'recording', 'complete', 'error'];
const processingStates = ['processing', 'processing-0', 'processing-1', 'processing-2', 'processing-3'];
const trayVariants = ['', 'Template', '@2x', 'Template@2x'];
const runtimeTrayAssets = [...trayStates, ...processingStates]
  .flatMap((state) => trayVariants.map((variant) => `tray-${state}${variant}.png`));
const runtimeTaskbarAssets = [
  'overlay-recording.png',
  'overlay-processing.png',
  'toolbar-record.png',
  'toolbar-stop.png',
  'toolbar-screenshot.png',
  'toolbar-settings.png',
];

function writeRuntimeTrayAssets(resources: string): void {
  mkdirSync(join(resources, 'assets'), { recursive: true });
  for (const name of runtimeTrayAssets) {
    writeFileSync(join(resources, 'assets', name), 'fixture');
  }
}

function writeRuntimeTaskbarAssets(resources: string): void {
  mkdirSync(join(resources, 'build'), { recursive: true });
  for (const name of runtimeTaskbarAssets) {
    writeFileSync(join(resources, 'build', name), 'fixture');
  }
}

function validMacPackageSkeleton(root: string): string {
  const contents = join(root, 'mac', 'MarkuprPlus.app', 'Contents');
  const resources = join(contents, 'Resources');
  const executableDirectory = join(contents, 'MacOS');
  mkdirSync(resources, { recursive: true });
  mkdirSync(executableDirectory, { recursive: true });
  writeFileSync(join(resources, 'app.asar'), 'fixture');
  writeFileSync(join(executableDirectory, 'MarkuprPlus'), 'fixture');
  writeFileSync(
    join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>MarkuprPlus</string>
<key>CFBundleName</key><string>MarkuprPlus</string>
<key>CFBundleExecutable</key><string>MarkuprPlus</string>
<key>CFBundleIdentifier</key><string>com.eddiesanjuan.markuprx</string>
</dict></plist>`,
  );
  writeRuntimeTrayAssets(resources);
  return resources;
}

function validWindowsPackageSkeleton(root: string): string {
  const unpacked = join(root, 'win-unpacked');
  const resources = join(unpacked, 'resources');
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, 'app.asar'), 'fixture');
  writeFileSync(join(unpacked, 'MarkuprPlus.exe'), 'fixture');
  writeRuntimeTrayAssets(resources);
  writeRuntimeTaskbarAssets(resources);
  return resources;
}

function thinMachO(architecture: 'x64' | 'arm64'): Buffer {
  const binary = Buffer.alloc(32);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(architecture === 'x64' ? 0x01000007 : 0x0100000c, 4);
  return binary;
}

function universalMachO(): Buffer {
  const binary = Buffer.alloc(48);
  binary.writeUInt32BE(0xcafebabe, 0);
  binary.writeUInt32BE(2, 4);
  binary.writeUInt32BE(0x01000007, 8);
  binary.writeUInt32BE(0x0100000c, 28);
  return binary;
}

function validUniversalPackage(
  root: string,
  layout = 'mac-universal',
): { executable: string; resources: string } {
  const contents = join(root, layout, 'MarkuprPlus.app', 'Contents');
  const resources = join(contents, 'Resources');
  const executableDirectory = join(contents, 'MacOS');
  mkdirSync(resources, { recursive: true });
  mkdirSync(executableDirectory, { recursive: true });
  writeFileSync(join(resources, 'app.asar'), 'fixture');
  writeFileSync(join(executableDirectory, 'MarkuprPlus'), universalMachO());
  writeFileSync(
    join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>MarkuprPlus</string>
<key>CFBundleName</key><string>MarkuprPlus</string>
<key>CFBundleExecutable</key><string>MarkuprPlus</string>
<key>CFBundleIdentifier</key><string>com.eddiesanjuan.markuprx</string>
</dict></plist>`,
  );
  writeRuntimeTrayAssets(resources);

  const modules = join(resources, 'app.asar.unpacked', 'node_modules');
  const keytar = join(modules, 'keytar', 'build', 'Release', 'keytar.node');
  const whisper = join(modules, 'whisper-node', 'lib', 'whisper.cpp', 'main');
  mkdirSync(join(keytar, '..'), { recursive: true });
  mkdirSync(join(whisper, '..'), { recursive: true });
  writeFileSync(keytar, universalMachO());
  writeFileSync(whisper, universalMachO());
  for (const architecture of ['x64', 'arm64'] as const) {
    const addon = join(modules, '@img', `sharp-darwin-${architecture}`);
    const libvips = join(modules, '@img', `sharp-libvips-darwin-${architecture}`);
    mkdirSync(addon, { recursive: true });
    mkdirSync(libvips, { recursive: true });
    writeFileSync(join(addon, `sharp-darwin-${architecture}.node`), thinMachO(architecture));
    writeFileSync(join(libvips, `libvips-${architecture}.dylib`), thinMachO(architecture));
  }
  return { executable: join(executableDirectory, 'MarkuprPlus'), resources };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('public package verification', () => {
  it('reports the public product name when no packaged runtime exists', () => {
    const result = verify(fixture());

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No packaged MarkuprPlus runtime found');
  });

  it('rejects a macOS bundle that retains the legacy public application name', () => {
    const root = fixture();
    const resources = join(root, 'mac', 'MarkuprX.app', 'Contents', 'Resources');
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'fixture');

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Packaged macOS application must be named MarkuprPlus.app',
    );
  });

  it('rejects a Windows package without the public executable name', () => {
    const root = fixture();
    const unpacked = join(root, 'win-unpacked');
    const resources = join(unpacked, 'resources');
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'fixture');
    writeFileSync(join(unpacked, 'markuprx.exe'), 'fixture');

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Packaged Windows executable is missing: ${join(unpacked, 'MarkuprPlus.exe')}`,
    );
  });

  it('rejects a Linux package without the public executable name', () => {
    const root = fixture();
    const unpacked = join(root, 'linux-unpacked');
    const resources = join(unpacked, 'resources');
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'fixture');
    writeFileSync(join(unpacked, 'markuprx'), 'fixture');

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Packaged Linux executable is missing: ${join(unpacked, 'MarkuprPlus')}`,
    );
  });

  it('rejects a public macOS bundle with incompatible plist identity', () => {
    const root = fixture();
    const appRoot = join(root, 'mac', 'MarkuprPlus.app');
    const contents = join(appRoot, 'Contents');
    const resources = join(contents, 'Resources');
    const executableDirectory = join(contents, 'MacOS');
    mkdirSync(resources, { recursive: true });
    mkdirSync(executableDirectory, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'fixture');
    writeFileSync(join(executableDirectory, 'MarkuprPlus'), 'fixture');
    writeFileSync(
      join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>MarkuprPlus</string>
<key>CFBundleName</key><string>MarkuprPlus</string>
<key>CFBundleExecutable</key><string>MarkuprPlus</string>
<key>CFBundleIdentifier</key><string>com.example.wrong</string>
</dict></plist>`,
    );

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Packaged macOS bundle identifier must remain com.eddiesanjuan.markuprx',
    );
  });

  it.each([
    'demo-cli.gif',
    'tray-icon.png',
    'tray-marketing.png',
  ])('rejects a non-runtime packaged resource: %s', (assetName) => {
    const root = fixture();
    const appRoot = join(root, 'mac', 'MarkuprPlus.app');
    const contents = join(appRoot, 'Contents');
    const resources = join(contents, 'Resources');
    const executableDirectory = join(contents, 'MacOS');
    const assets = join(resources, 'assets');
    mkdirSync(assets, { recursive: true });
    mkdirSync(executableDirectory, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'fixture');
    writeFileSync(join(executableDirectory, 'MarkuprPlus'), 'fixture');
    writeFileSync(join(assets, assetName), 'fixture');
    writeFileSync(
      join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>MarkuprPlus</string>
<key>CFBundleName</key><string>MarkuprPlus</string>
<key>CFBundleExecutable</key><string>MarkuprPlus</string>
<key>CFBundleIdentifier</key><string>com.eddiesanjuan.markuprx</string>
</dict></plist>`,
    );

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Packaged resources contain non-runtime assets: ${join(assets, assetName)}`,
    );
  });

  it('requires the complete 36-file tray runtime inventory', () => {
    const root = fixture();
    const resources = validMacPackageSkeleton(root);
    const missing = 'tray-processing-3Template@2x.png';
    rmSync(join(resources, 'assets', missing));

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Packaged runtime tray assets are missing');
    expect(result.stderr).toContain(missing);
  });

  it('requires the exact six-file taskbar runtime inventory', () => {
    const root = fixture();
    const resources = validWindowsPackageSkeleton(root);
    rmSync(join(resources, 'build', 'toolbar-settings.png'));

    const missingResult = verify(root);
    expect(missingResult.status).toBe(1);
    expect(missingResult.stderr).toContain('Packaged runtime taskbar assets are missing');
    expect(missingResult.stderr).toContain('toolbar-settings.png');

    writeFileSync(join(resources, 'build', 'toolbar-settings.png'), 'fixture');
    writeFileSync(join(resources, 'build', 'marketing-banner.png'), 'fixture');
    const extraResult = verify(root);
    expect(extraResult.status).toBe(1);
    expect(extraResult.stderr).toContain('Packaged resources contain non-runtime taskbar assets');
    expect(extraResult.stderr).toContain('marketing-banner.png');
  });

  it('accepts the exact tray and taskbar inventories before native-runtime checks', () => {
    const root = fixture();
    validWindowsPackageSkeleton(root);

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Packaged native runtime is incomplete');
    expect(result.stderr).not.toContain('runtime tray assets');
    expect(result.stderr).not.toContain('runtime taskbar assets');
  });

  it('verifies both native architecture slices in a universal macOS package', () => {
    const root = fixture();
    validUniversalPackage(root);

    const result = verify(root);

    expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
    expect(result.stdout).toContain('sharp-darwin-x64');
    expect(result.stdout).toContain('sharp-darwin-arm64');
  });

  it('verifies both native architecture slices in the MAS universal layout', () => {
    const root = fixture();
    validUniversalPackage(root, 'mas-universal');

    const result = verify(root);

    expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
    expect(result.stdout).toContain('sharp-darwin-x64');
    expect(result.stdout).toContain('sharp-darwin-arm64');
  });

  it('rejects a universal package whose public executable is missing a slice', () => {
    const root = fixture();
    const { executable } = validUniversalPackage(root);
    writeFileSync(executable, thinMachO('x64'));

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`wrong architecture: ${executable}`);
    expect(result.stderr).toContain('Expected x64 + arm64; found x64');
  });

  it('rejects a mislabeled Sharp libvips architecture', () => {
    const root = fixture();
    const { resources } = validUniversalPackage(root);
    const libvips = join(
      resources,
      'app.asar.unpacked',
      'node_modules',
      '@img',
      'sharp-libvips-darwin-arm64',
      'libvips-arm64.dylib',
    );
    writeFileSync(libvips, thinMachO('x64'));

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`wrong architecture: ${libvips}`);
    expect(result.stderr).toContain('Expected arm64; found x64');
  });

  it('rejects Windows-only taskbar assets from macOS packages', () => {
    const root = fixture();
    const resources = validMacPackageSkeleton(root);
    writeRuntimeTaskbarAssets(resources);

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('non-runtime taskbar assets');
    expect(result.stderr).toContain('overlay-recording.png');
  });

  it('classifies package platforms from their layout rather than parent directory names', () => {
    const root = fixture();
    validMacPackageSkeleton(join(root, 'win-review'));

    const result = verify(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Packaged native runtime is incomplete');
    expect(result.stderr).not.toContain('runtime taskbar assets');
  });

  it.each([
    'MarkuprX-3.0.0-mac.zip',
    'markuprx-3.0.0-arm64.dmg',
    'markuprx-Setup-3.0.0.exe',
  ])('rejects a stale legacy distributable anywhere in the release root: %s', (name) => {
    const root = fixture();
    const nested = join(root, 'reused-output');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, name), 'stale release artifact');

    const result = verify(root, { artifacts: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Legacy-branded distributable is forbidden');
    expect(result.stderr).toContain(name);
  });

  it('rejects a mixed release root containing both canonical and stale artifacts', () => {
    const root = fixture();
    writeFileSync(join(root, 'markuprplus-3.0.0-arm64.dmg'), 'canonical');
    writeFileSync(join(root, 'MarkuprX-3.0.0-arm64-mac.zip'), 'stale');

    const result = verify(root, { artifacts: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Legacy-branded distributable is forbidden');
    expect(result.stderr).toContain('MarkuprX-3.0.0-arm64-mac.zip');
  });

  it('rejects noncanonical distributable filenames even when they use the public name', () => {
    const root = fixture();
    writeFileSync(join(root, 'MarkuprPlus Installer 3.0.0.dmg'), 'fixture');

    const result = verify(root, { artifacts: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Noncanonical MarkuprPlus distributable filename');
  });

  it.each([
    'markuprplus-3.1.1-arm64.dmg',
    'MarkuprPlus-3.1.1-arm64-mac.zip',
    'markuprplus-Setup-3.1.1.exe',
    'MarkuprPlus 3.1.1.exe',
    'markuprplus-3.1.1-x86_64.AppImage',
    'markuprplus-3.1.1-amd64.deb',
  ])('accepts the canonical filename contract before runtime verification: %s', (name) => {
    const root = fixture();
    writeFileSync(join(root, name), 'fixture');

    const result = verify(root, { artifacts: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No packaged MarkuprPlus runtime found');
    expect(result.stderr).not.toContain('distributable filename');
  });

  it('requires a distributable in release mode but keeps dir-only verification explicit', () => {
    const root = fixture();

    const releaseResult = verify(root, { artifacts: true });
    const directoryResult = verify(root);

    expect(releaseResult.status).toBe(1);
    expect(releaseResult.stderr).toContain('No MarkuprPlus distributable artifacts found');
    expect(directoryResult.status).toBe(1);
    expect(directoryResult.stderr).toContain('No packaged MarkuprPlus runtime found');
  });
});

describe('packaged application smoke entry point', () => {
  it.each([
    {
      target: 'darwin:x64',
      executablePath: resolve(
        'release', 'mac', 'MarkuprPlus.app', 'Contents', 'MacOS', 'MarkuprPlus',
      ),
      resourcesPath: resolve('release', 'mac', 'MarkuprPlus.app', 'Contents', 'Resources'),
    },
    {
      target: 'darwin:arm64',
      executablePath: resolve(
        'release', 'mac-arm64', 'MarkuprPlus.app', 'Contents', 'MacOS', 'MarkuprPlus',
      ),
      resourcesPath: resolve(
        'release', 'mac-arm64', 'MarkuprPlus.app', 'Contents', 'Resources',
      ),
    },
    {
      target: 'darwin:universal',
      executablePath: resolve(
        'release', 'mac-universal', 'MarkuprPlus.app', 'Contents', 'MacOS', 'MarkuprPlus',
      ),
      resourcesPath: resolve(
        'release', 'mac-universal', 'MarkuprPlus.app', 'Contents', 'Resources',
      ),
    },
    {
      target: 'win32:x64',
      executablePath: resolve('release', 'win-unpacked', 'MarkuprPlus.exe'),
      resourcesPath: resolve('release', 'win-unpacked', 'resources'),
    },
    {
      target: 'linux:x64',
      executablePath: resolve('release', 'linux-unpacked', 'MarkuprPlus'),
      resourcesPath: resolve('release', 'linux-unpacked', 'resources'),
    },
  ])('resolves $target public executable and resource paths', (expected) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/smoke-packaged-app.mjs', `--print-layout=${expected.target}`],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          MARKUPRX_PACKAGED_EXECUTABLE: '/definitely/not/a/packaged/application',
        },
      },
    );

    expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
    expect(JSON.parse(result.stdout)).toEqual({
      executablePath: expected.executablePath,
      resourcesPath: expected.resourcesPath,
    });
  });

  it('supports a real-process startup probe for translated package architectures', () => {
    const root = fixture();
    const executable = join(
      root,
      'MarkuprPlus.app',
      'Contents',
      'MacOS',
      'MarkuprPlus',
    );
    mkdirSync(join(root, 'MarkuprPlus.app', 'Contents', 'Resources'), { recursive: true });
    mkdirSync(join(root, 'MarkuprPlus.app', 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(
      executable,
      '#!/usr/bin/env node\nconsole.log("[Main] Popover ready to show");\n',
    );
    chmodSync(executable, 0o755);

    const result = spawnSync(process.execPath, ['scripts/smoke-packaged-app.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        MARKUPRX_PACKAGED_EXECUTABLE: executable,
        MARKUPRX_EXPECTED_ARCH: 'x64',
        MARKUPRX_PACKAGE_SMOKE_MODE: 'startup',
      },
    });

    expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
    expect(JSON.parse(result.stdout)).toMatchObject({
      executablePath: executable,
      mode: 'startup',
      startupReady: true,
    });
  });
});
