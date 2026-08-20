import type { MenuItemConstructorOptions } from 'electron';
import {
  PUBLIC_BRAND_NAME,
  PUBLIC_CONTACT_URL,
  PUBLIC_WEBSITE_URL,
} from '../shared/publicBrand';
import type { TrayState } from '../shared/types';

export const HELP_URL = PUBLIC_WEBSITE_URL;
export const CONTACT_URL = PUBLIC_CONTACT_URL;

type ExternalDestination = 'help' | 'contact';

export interface TrayMenuActions {
  toggleRecording: () => void;
  openSettings: () => void;
  openExternal: (url: string) => Promise<void>;
  quit: () => void;
  reportExternalError: (
    destination: ExternalDestination,
    error: unknown,
  ) => void;
}

export interface TrayMenuOptions {
  platform: NodeJS.Platform;
  state: TrayState;
  actions: TrayMenuActions;
}

function externalAction(
  destination: ExternalDestination,
  url: string,
  actions: TrayMenuActions,
): () => void {
  return () => {
    void Promise.resolve()
      .then(() => actions.openExternal(url))
      .catch((error: unknown) => {
        try {
          actions.reportExternalError(destination, error);
        } catch {
          // A logging failure must not destabilize the native tray handler.
        }
      });
  };
}

export function buildTrayContextMenuTemplate({
  platform,
  state,
  actions,
}: TrayMenuOptions): MenuItemConstructorOptions[] {
  const isRecording = state === 'recording';
  const isProcessing = state === 'processing';

  return [
    {
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      enabled: !isProcessing,
      click: actions.toggleRecording,
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      accelerator: 'CmdOrCtrl+,',
      click: actions.openSettings,
    },
    { type: 'separator' },
    {
      label: 'Help',
      click: externalAction('help', HELP_URL, actions),
    },
    {
      label: 'Contact',
      click: externalAction('contact', CONTACT_URL, actions),
    },
    { type: 'separator' },
    { label: `About ${PUBLIC_BRAND_NAME}`, role: 'about' },
    { type: 'separator' },
    {
      label: platform === 'darwin'
        ? `Quit ${PUBLIC_BRAND_NAME}`
        : `Exit ${PUBLIC_BRAND_NAME}`,
      accelerator: 'CmdOrCtrl+Q',
      click: actions.quit,
    },
  ];
}
