import { describe, expect, it } from 'vitest';
import {
  buildTheme,
  getContrastColor,
  resolveAccentColor,
} from '../../src/renderer/hooks/useTheme';

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

describe('custom accent colors', () => {
  it('resolves preset keys and preset hex values case-insensitively', () => {
    expect(resolveAccentColor('blue').default).toBe('#3b82f6');
    expect(resolveAccentColor('#3B82F6').name).toBe('Ocean Blue');
  });

  it('derives usable interaction colors for a custom accent', () => {
    expect(resolveAccentColor('#123456')).toEqual({
      default: '#123456',
      hover: '#102e4c',
      active: '#0e2943',
      name: 'Custom',
    });
    expect(buildTheme({
      mode: 'dark',
      accentColor: '#123456',
      systemPrefersDark: false,
    }).cssProperties['--accent-default']).toBe('#123456');
  });

  it('falls back safely when persisted accent data is invalid', () => {
    expect(resolveAccentColor('not-a-color').default).toBe('#3b82f6');
  });
});
