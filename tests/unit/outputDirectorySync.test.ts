import { describe, expect, it, vi } from 'vitest';
import { synchronizeOutputDirectory } from '../../src/main/settings/synchronizeOutputDirectory';

describe('output directory synchronization', () => {
  it('applies persisted state immediately and follows only validated output changes', () => {
    let listener: ((key: string, value: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const settings = {
      get: vi.fn(() => '/safe/persisted-output'),
      onChange: vi.fn((callback: (key: string, value: unknown) => void) => {
        listener = callback;
        return unsubscribe;
      }),
    };
    const files = { setOutputDirectory: vi.fn() };

    const stop = synchronizeOutputDirectory(settings, files);
    expect(files.setOutputDirectory).toHaveBeenCalledWith('/safe/persisted-output');

    listener?.('theme', 'dark');
    listener?.('outputDirectory', { injected: true });
    expect(files.setOutputDirectory).toHaveBeenCalledTimes(1);

    listener?.('outputDirectory', '/safe/changed-output');
    expect(files.setOutputDirectory).toHaveBeenLastCalledWith('/safe/changed-output');
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
