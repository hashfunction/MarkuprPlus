import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { generateMasIconAssets } from '../../scripts/generate-mas-icons.mjs';

vi.unmock('sharp');

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

describe('Mac App Store icon generation', () => {
  it.skipIf(process.platform !== 'darwin')(
    'creates a complete macOS iconset and ICNS bundle from the approved master',
    async () => {
      const outputRoot = await mkdtemp(join(tmpdir(), 'markuprplus-mas-icon-'));
      temporaryDirectories.push(outputRoot);
      const iconsetDirectory = join(outputRoot, 'MarkuprPlus.iconset');
      const icnsPath = join(outputRoot, 'MarkuprPlus.icns');

      await generateMasIconAssets({
        sourcePath: 'app-store/assets/markuprplus-mas-icon-master.png',
        iconsetDirectory,
        icnsPath,
      });

      const expectedSizes = new Map([
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
      ]);

      expect((await readdir(iconsetDirectory)).sort()).toEqual(
        [...expectedSizes.keys()].sort(),
      );
      for (const [name, size] of expectedSizes) {
        const metadata = await sharp(join(iconsetDirectory, name)).metadata();
        expect({ width: metadata.width, height: metadata.height }).toEqual({
          width: size,
          height: size,
        });
      }
      expect((await stat(icnsPath)).size).toBeGreaterThan(0);
    },
  );
});
