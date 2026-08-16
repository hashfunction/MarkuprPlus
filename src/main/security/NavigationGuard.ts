import { shell, type WebContents } from 'electron';

/** Keep privileged preload APIs confined to MarkuprX-owned renderer pages. */
export function protectRendererNavigation(webContents: WebContents): void {
  webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url).catch((error) => {
          console.warn('[NavigationGuard] Failed to open external URL:', error);
        });
      } else {
        console.warn(`[NavigationGuard] Blocked external URL with protocol: ${parsed.protocol}`);
      }
    } catch {
      console.warn('[NavigationGuard] Blocked invalid external URL.');
    }
    return { action: 'deny' };
  });
}
