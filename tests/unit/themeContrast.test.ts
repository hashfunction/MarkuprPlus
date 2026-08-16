import { describe, expect, it } from 'vitest';
import { getContrastColor } from '../../src/renderer/hooks/useTheme';

describe('getContrastColor', () => {
  it.each([
    ['#ffffff', 'black'],
    ['#3b82f6', 'black'],
    ['#f59e0b', 'black'],
    ['#111827', 'white'],
    ['#000000', 'white'],
  ] as const)('chooses the higher-contrast text for %s', (background, expected) => {
    expect(getContrastColor(background)).toBe(expected);
  });

  it('fails safely to white for an unsupported color value', () => {
    expect(getContrastColor('transparent')).toBe('white');
  });
});
