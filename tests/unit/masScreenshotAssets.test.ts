import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.unmock('sharp');

describe('Mac App Store screenshot assets', () => {
  it('ships five true-color PNG screenshots at the approved Mac dimensions', async () => {
    const directory = 'app-store/screenshots/2880x1800';
    const screenshotNames = (await readdir(directory))
      .filter((name) => name.endsWith('.png'))
      .sort();

    expect(screenshotNames).toHaveLength(5);

    for (const name of screenshotNames) {
      const metadata = await sharp(join(directory, name)).metadata();
      expect(
        {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          space: metadata.space,
          hasAlpha: metadata.hasAlpha,
        },
        name,
      ).toEqual({
        format: 'png',
        width: 2880,
        height: 1800,
        space: 'srgb',
        hasAlpha: false,
      });
    }
  });
});
