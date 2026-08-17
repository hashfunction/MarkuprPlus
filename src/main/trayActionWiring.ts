export interface TrayActionRegistrar {
  onClick(callback: () => void): void;
  onRecordingClick(callback: () => void): void;
  onSettingsClick(callback: () => void): void;
}

export interface TrayActionCallbacks {
  openPopover: () => void;
  toggleRecording: () => void;
  openSettings: () => void;
}

export function wireTrayActionCallbacks(
  tray: TrayActionRegistrar,
  callbacks: TrayActionCallbacks,
): void {
  tray.onClick(callbacks.openPopover);
  tray.onRecordingClick(callbacks.toggleRecording);
  tray.onSettingsClick(callbacks.openSettings);
}
