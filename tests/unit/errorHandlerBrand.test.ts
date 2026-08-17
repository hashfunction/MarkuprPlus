import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog, Notification } from 'electron';
import ErrorHandler from '../../src/main/ErrorHandler';

const originalIsSupported = Object.getOwnPropertyDescriptor(
  Notification,
  'isSupported',
);

function publicDialogCopy(): string {
  const options = vi.mocked(dialog.showMessageBox).mock.calls.at(-1)?.at(-1) as
    | Electron.MessageBoxOptions
    | undefined;
  if (!options) throw new Error('Expected a native message box.');
  return [options.title, options.message, options.detail].filter(Boolean).join('\n');
}

describe('ErrorHandler public brand copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Notification, 'isSupported', {
      configurable: true,
      value: vi.fn(() => false),
    });
    vi.mocked(dialog.showMessageBox).mockResolvedValue({
      response: 1,
      checkboxChecked: false,
    });
  });

  afterEach(() => {
    if (originalIsSupported) {
      Object.defineProperty(Notification, 'isSupported', originalIsSupported);
    } else {
      Reflect.deleteProperty(Notification, 'isSupported');
    }
  });

  it('uses MarkuprPlus in permission and API guidance', async () => {
    const handler = new ErrorHandler();
    await handler.handlePermissionError('microphone');
    expect(publicDialogCopy()).toContain('MarkuprPlus');
    expect(publicDialogCopy()).not.toContain('MarkuprX');

    handler.handleApiKeyError();
    expect(publicDialogCopy()).toContain('MarkuprPlus');
    expect(publicDialogCopy()).not.toContain('MarkuprX');
  });

  it('prefixes native notifications with MarkuprPlus', () => {
    vi.mocked(Notification.isSupported).mockReturnValue(true);
    const handler = new ErrorHandler();

    handler.notifyUser('Recording Error', 'Capture failed.');

    expect(vi.mocked(Notification)).toHaveBeenCalledWith(expect.objectContaining({
      title: 'MarkuprPlus: Recording Error',
    }));
  });
});
