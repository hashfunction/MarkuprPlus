import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const sandboxes: string[] = [];

function sandbox(): string {
  const root = mkdtempSync(join(process.cwd(), '.packaging-generator-'));
  sandboxes.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  return root;
}

function run(script: string, cwd: string) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function iconGeneratorSandbox(options: {
  includeDmg?: boolean;
  includeDarkLogo?: boolean;
  brokenPng2Icons?: boolean;
} = {}): string {
  const root = sandbox();
  cpSync('scripts/generate-icons.mjs', join(root, 'scripts', 'generate-icons.mjs'));
  cpSync('assets/svg-source', join(root, 'assets', 'svg-source'), { recursive: true });
  mkdirSync(join(root, 'src', 'renderer', 'assets'), { recursive: true });
  cpSync(
    'src/renderer/assets/logo.svg',
    join(root, 'src', 'renderer', 'assets', 'logo.svg'),
  );
  if (options.includeDarkLogo !== false) {
    cpSync(
      'src/renderer/assets/logo-dark.svg',
      join(root, 'src', 'renderer', 'assets', 'logo-dark.svg'),
    );
  }
  if (options.includeDmg === false) {
    rmSync(join(root, 'assets', 'svg-source', 'dmg-background.svg'));
  }
  if (options.brokenPng2Icons) {
    mkdirSync(join(root, 'build'), { recursive: true });
    writeFileSync(join(root, 'build', 'icon.ico'), 'stale legacy icon');
    const dependency = join(root, 'node_modules', 'png2icons');
    mkdirSync(dependency, { recursive: true });
    writeFileSync(
      join(dependency, 'package.json'),
      '{"name":"png2icons","version":"0.0.0","type":"module","main":"index.mjs"}\n',
    );
    writeFileSync(join(dependency, 'index.mjs'), 'throw new Error("fixture failure");\n');
  }
  return root;
}

function writePackage(root: string, productName: string, homepage: string): void {
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ version: '3.0.0', productName, homepage }, null, 2)}\n`,
  );
}

function pngMetadata(input: string | Buffer) {
  const bytes = Buffer.isBuffer(input) ? input : readFileSync(input);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  const colorType = bytes[25];
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    format: 'png',
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function runInstallerGenerator(productName: string): Buffer {
  const root = sandbox();
  mkdirSync(join(root, 'build'), { recursive: true });
  cpSync(
    'scripts/generate-installer-images.cjs',
    join(root, 'scripts', 'generate-installer-images.cjs'),
  );
  writePackage(root, productName, 'https://markuprplus.com');

  const result = run(join(root, 'scripts', 'generate-installer-images.cjs'), root);
  expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
  return readFileSync(join(root, 'build', 'installer-header.png'));
}

function runOgGenerator(productName: string, homepage: string): {
  image: Buffer;
  stdout: string;
} {
  const root = sandbox();
  mkdirSync(join(root, 'site'), { recursive: true });
  cpSync(
    'scripts/generate-og-image.mjs',
    join(root, 'scripts', 'generate-og-image.mjs'),
  );
  writePackage(root, productName, homepage);

  const result = run(join(root, 'scripts', 'generate-og-image.mjs'), root);
  expect(result, result.stderr).toMatchObject({ status: 0, signal: null });
  return {
    image: readFileSync(join(root, 'site', 'og-image.png')),
    stdout: result.stdout,
  };
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('public packaging artwork generators', () => {
  it('derives the 400px marketplace logo from the renderer logo', async () => {
    const root = iconGeneratorSandbox();

    const result = run(join(root, 'scripts', 'generate-icons.mjs'), root);
    expect(result, result.stderr).toMatchObject({ status: 0, signal: null });

    const output = join(root, 'assets', 'logo-400.png');
    expect(existsSync(output)).toBe(true);
    expect(pngMetadata(output)).toMatchObject({
      width: 400,
      height: 400,
      format: 'png',
      hasAlpha: true,
    });
    expect(existsSync(join(root, 'build', 'icon.ico'))).toBe(true);
    expect(pngMetadata(join(root, 'build', 'dmg-background.png')))
      .toMatchObject({ width: 660, height: 400, format: 'png' });
    expect(pngMetadata(join(root, 'build', 'dmg-background@2x.png')))
      .toMatchObject({ width: 1320, height: 800, format: 'png' });
    const processingFrames = [0, 1, 2, 3].map((frame) =>
      readFileSync(join(root, 'assets', `tray-processing-${frame}.png`)).toString('base64'));
    expect(new Set(processingFrames).size).toBe(4);
  });

  it('fails closed when a required DMG source is missing', () => {
    const root = iconGeneratorSandbox({ includeDmg: false });
    const result = run(join(root, 'scripts', 'generate-icons.mjs'), root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dmg-background.svg');
  });

  it('fails closed when a required renderer logo is missing', () => {
    const root = iconGeneratorSandbox({ includeDarkLogo: false });
    const result = run(join(root, 'scripts', 'generate-icons.mjs'), root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('logo-dark.svg');
  });

  it('fails closed instead of accepting a stale ICO after conversion failure', () => {
    const root = iconGeneratorSandbox({ brokenPng2Icons: true });
    const result = run(join(root, 'scripts', 'generate-icons.mjs'), root);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'build', 'icon.ico'))).toBe(false);
  });

  it('renders installer artwork from the configured public product name', async () => {
    const publicHeader = runInstallerGenerator('MarkuprPlus');
    const alternateHeader = runInstallerGenerator('AlternateProduct');

    expect(publicHeader.equals(alternateHeader)).toBe(false);
    expect(pngMetadata(publicHeader)).toMatchObject({
      width: 150,
      height: 57,
      format: 'png',
    });
  });

  it('renders social artwork from public package name and website metadata', async () => {
    const publicImage = runOgGenerator('MarkuprPlus', 'https://markuprplus.com');
    const alternateImage = runOgGenerator('AlternateProduct', 'https://example.invalid');

    expect(publicImage.image.equals(alternateImage.image)).toBe(false);
    expect(pngMetadata(publicImage.image)).toMatchObject({
      width: 1200,
      height: 630,
      format: 'png',
    });
    expect(publicImage.stdout).toMatch(/Size: [1-9]\d* KB/);
  });
});
