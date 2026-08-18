import { shell, type WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openTrustedExternalURL, protectRendererNavigation } from '../../src/main/security/NavigationGuard';
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

  it('cancels navigation, redirects, and embedded webviews', () => {
    const fixture = webContentsFixture();
    protectRendererNavigation(fixture.webContents);
    const navigation = { preventDefault: vi.fn() };
    const redirect = { preventDefault: vi.fn() };
    const webview = { preventDefault: vi.fn() };

    fixture.listeners.get('will-navigate')?.(navigation);
    fixture.listeners.get('will-redirect')?.(redirect);
    fixture.listeners.get('will-attach-webview')?.(webview);

    expect(navigation.preventDefault).toHaveBeenCalledOnce();
    expect(redirect.preventDefault).toHaveBeenCalledOnce();
    expect(webview.preventDefault).toHaveBeenCalledOnce();
  });

  it('denies every popup while handing only trusted HTTPS destinations to the OS browser', () => {
    const fixture = webContentsFixture();
    protectRendererNavigation(fixture.webContents);

    expect(fixture.open(`${PUBLIC_WEBSITE_URL}/help`)).toEqual({ action: 'deny' });
    expect(fixture.open('http://localhost:3000/docs')).toEqual({ action: 'deny' });
    expect(fixture.open('https://user:pass@example.com/docs')).toEqual({ action: 'deny' });
    expect(fixture.open('file:///private/tmp/report.html')).toEqual({ action: 'deny' });
    expect(fixture.open('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(fixture.open('not a url')).toEqual({ action: 'deny' });

    expect(shell.openExternal).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenNthCalledWith(1, `${PUBLIC_WEBSITE_URL}/help`);
  });

  it('contains synchronous and asynchronous external-launch failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(shell.openExternal).mockRejectedValueOnce(new Error('blocked'));
    expect(openTrustedExternalURL(`${PUBLIC_WEBSITE_URL}/contact`)).toBe(true);
    await Promise.resolve();

    vi.mocked(shell.openExternal).mockImplementationOnce(() => {
      throw new Error('sync failure');
    });
    expect(openTrustedExternalURL('https://example.com/')).toBe(false);
    expect(openTrustedExternalURL('data:text/html,hello')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
