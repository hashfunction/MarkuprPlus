import { shell, type WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { protectRendererNavigation } from '../../src/main/security/NavigationGuard';
import { PUBLIC_WEBSITE_URL } from '../../src/shared/publicBrand';

function webContentsFixture() {
  const listeners = new Map<string, (event: { preventDefault(): void }) => void>();
  let openHandler: ((details: { url: string }) => { action: 'deny' }) | null = null;
  const webContents = {
    on: vi.fn((event: string, listener: (value: { preventDefault(): void }) => void) => {
      listeners.set(event, listener);
    }),
    setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
      openHandler = handler;
    }),
  } as unknown as WebContents;
  return {
    webContents,
    listeners,
    open: (url: string) => {
      if (!openHandler) throw new Error('Window-open policy was not installed.');
      return openHandler({ url });
    },
  };
}

describe('protectRendererNavigation', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear();
  });

  it('cancels top-level navigation and embedded webviews', () => {
    const fixture = webContentsFixture();
    protectRendererNavigation(fixture.webContents);
    const navigation = { preventDefault: vi.fn() };
    const webview = { preventDefault: vi.fn() };

    fixture.listeners.get('will-navigate')?.(navigation);
    fixture.listeners.get('will-attach-webview')?.(webview);

    expect(navigation.preventDefault).toHaveBeenCalledOnce();
    expect(webview.preventDefault).toHaveBeenCalledOnce();
  });

  it('denies every popup while handing only HTTP(S) destinations to the OS browser', () => {
    const fixture = webContentsFixture();
    protectRendererNavigation(fixture.webContents);

    expect(fixture.open(`${PUBLIC_WEBSITE_URL}/help`)).toEqual({ action: 'deny' });
    expect(fixture.open('http://localhost:3000/docs')).toEqual({ action: 'deny' });
    expect(fixture.open('file:///private/tmp/report.html')).toEqual({ action: 'deny' });
    expect(fixture.open('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(fixture.open('not a url')).toEqual({ action: 'deny' });

    expect(shell.openExternal).toHaveBeenCalledTimes(2);
    expect(shell.openExternal).toHaveBeenNthCalledWith(1, `${PUBLIC_WEBSITE_URL}/help`);
    expect(shell.openExternal).toHaveBeenNthCalledWith(2, 'http://localhost:3000/docs');
  });
});
