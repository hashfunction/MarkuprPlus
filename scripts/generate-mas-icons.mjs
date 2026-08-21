import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ICONSET_SIZES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

export async function generateMasIconAssets({
  sourcePath,
  iconsetDirectory,
  icnsPath,
}) {
  await rm(iconsetDirectory, { recursive: true, force: true });
  await mkdir(iconsetDirectory, { recursive: true });
  await mkdir(dirname(icnsPath), { recursive: true });

  for (const [name, size] of ICONSET_SIZES) {
    await sharp(sourcePath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(join(iconsetDirectory, name));
  }

  if (process.platform !== 'darwin') {
    throw new Error('Generating an ICNS bundle requires macOS iconutil.');
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetDirectory, '-o', icnsPath]);
}

async function main() {
  const projectRoot = resolve(import.meta.dirname, '..');
  await generateMasIconAssets({
    sourcePath: join(
      projectRoot,
      'app-store',
      'assets',
      'markuprplus-mas-icon-master.png',
    ),
    iconsetDirectory: join(projectRoot, 'build', 'mas-icon.iconset'),
    icnsPath: join(projectRoot, 'build', 'mas-icon.icns'),
  });
  console.log('[generate-mas-icons] Generated build/mas-icon.icns.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`[generate-mas-icons] ${error.message}`);
    process.exitCode = 1;
  });
}
