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

function verify(root: string) {
  return spawnSync(process.execPath, ['scripts/verify-package.mjs', root], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
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

  it('rejects marketing and source assets from packaged runtime resources', () => {
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
    writeFileSync(join(assets, 'demo-cli.gif'), 'fixture');
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
      `Packaged resources contain non-runtime assets: ${join(assets, 'demo-cli.gif')}`,
    );
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
