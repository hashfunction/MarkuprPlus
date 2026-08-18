import { app, type Session, type WebPreferences } from 'electron';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Security invariants shared by every repository-owned renderer window. */
export const SECURE_WEB_PREFERENCES: Readonly<WebPreferences> = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
  navigateOnDragDrop: false,
});

type SafePreferenceAdditions = Pick<WebPreferences, 'preload' | 'partition'>;

/**
 * Return browser preferences with caller-specific preload/partition additions,
 * while ensuring no caller can relax the renderer security policy.
 */
export function secureWebPreferences(
  additions: SafePreferenceAdditions = {},
): WebPreferences {
  return {
    ...additions,
    ...SECURE_WEB_PREFERENCES,
  };
}

function rendererRoot(): string {
  return resolve(app.getAppPath(), 'dist', 'renderer');
}

function isContainedPath(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !relativePath.startsWith(sep)
  );
}

/** Return whether a URL belongs to the packaged or exact development renderer. */
export function isTrustedRendererURL(rawUrl: string, devOrigin?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol === 'file:') {
    try {
      return isContainedPath(resolve(fileURLToPath(parsed)), rendererRoot());
    } catch {
      return false;
    }
  }

  if (!devOrigin) return false;
  try {
    const expected = new URL(devOrigin);
    return (expected.protocol === 'http:' || expected.protocol === 'https:')
      && parsed.origin === expected.origin;
  } catch {
    return false;
  }
}

type PermissionSource = Pick<Electron.WebContents, 'getURL'>;

function permitsRendererMedia(source: PermissionSource, permission: string, devOrigin?: string): boolean {
  return permission === 'media' && isTrustedRendererURL(source.getURL(), devOrigin);
}

/** Install a default-deny Chromium permission policy for the owned renderer. */
export function installPermissionPolicy(
  electronSession: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
  devOrigin?: string,
): void {
  electronSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents !== null && permitsRendererMedia(webContents, permission, devOrigin));
  });
  electronSession.setPermissionCheckHandler((webContents, permission) => (
    webContents !== null && permitsRendererMedia(webContents, permission, devOrigin)
  ));
}
