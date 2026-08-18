import { shell, type WebContents } from 'electron';

/** Launch only an ordinary credential-free HTTPS URL in the OS browser. */
export function openTrustedExternalURL(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return false;
    }
    try {
      void shell.openExternal(parsed.href).catch((error) => {
        console.warn('[NavigationGuard] Failed to open external URL:', error);
      });
      return true;
    } catch (error) {
      console.warn('[NavigationGuard] Failed to open external URL:', error);
      return false;
    }
  } catch {
    return false;
  }
}

/** Keep privileged preload APIs confined to MarkuprX-owned renderer pages. */
export function protectRendererNavigation(webContents: WebContents): void {
  webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  webContents.setWindowOpenHandler(({ url }) => {
    openTrustedExternalURL(url);
    return { action: 'deny' };
  });
}
