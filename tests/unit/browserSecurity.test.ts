import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  installPermissionPolicy,
  isTrustedRendererURL,
  SECURE_WEB_PREFERENCES,
  secureWebPreferences,
} from '../../src/main/security/BrowserSecurity';

const rendererUrl = pathToFileURL('/mock/app/path/dist/renderer/index.html').href;
const rendererOrigin = 'http://localhost:5173';

describe('BrowserSecurity', () => {
  it('keeps fixed renderer preferences when callers provide additions', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      navigateOnDragDrop: false,
    });

    expect(secureWebPreferences({
      preload: '/mock/preload.cjs',
      partition: 'persist:markuprplus',
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
      navigateOnDragDrop: true,
    } as never)).toMatchObject({
      preload: '/mock/preload.cjs',
      partition: 'persist:markuprplus',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      navigateOnDragDrop: false,
    });
  });

  it('accepts only the packaged renderer directory or the exact development origin', () => {
    expect(isTrustedRendererURL(rendererUrl, rendererOrigin)).toBe(true);
    expect(isTrustedRendererURL('file:///mock/app/path/dist/renderer/nested/page.html', rendererOrigin)).toBe(true);
    expect(isTrustedRendererURL('file:///mock/app/path/dist/main/index.mjs', rendererOrigin)).toBe(false);
    expect(isTrustedRendererURL('http://localhost:5173/settings', rendererOrigin)).toBe(true);
    expect(isTrustedRendererURL('http://localhost:5173.evil.test', rendererOrigin)).toBe(false);
    expect(isTrustedRendererURL('https://localhost:5173', rendererOrigin)).toBe(false);
    expect(isTrustedRendererURL('not a URL', rendererOrigin)).toBe(false);
  });

  it('allows only renderer-owned media permission and denies every other request', () => {
    let requestHandler: ((webContents: { getURL(): string }, permission: string, callback: (allowed: boolean) => void) => void) | undefined;
    let checkHandler: ((webContents: { getURL(): string }, permission: string, requestingOrigin: string) => boolean) | undefined;
    const session = {
      setPermissionRequestHandler: vi.fn((handler) => { requestHandler = handler; }),
      setPermissionCheckHandler: vi.fn((handler) => { checkHandler = handler; }),
    };
    const renderer = { getURL: () => rendererUrl };
    const attacker = { getURL: () => 'https://evil.test/' };
    const callback = vi.fn();

    installPermissionPolicy(session, rendererOrigin);
    requestHandler?.(renderer, 'media', callback);
    requestHandler?.(renderer, 'notifications', callback);
    requestHandler?.(attacker, 'media', callback);

    expect(callback.mock.calls).toEqual([[true], [false], [false]]);
    expect(checkHandler?.(renderer, 'media', rendererUrl)).toBe(true);
    expect(checkHandler?.(renderer, 'geolocation', rendererUrl)).toBe(false);
    expect(checkHandler?.(attacker, 'media', 'https://evil.test/')).toBe(false);
  });
});
