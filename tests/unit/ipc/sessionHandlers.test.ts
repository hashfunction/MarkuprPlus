import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../../src/main/SessionController', () => ({
  sessionController: {
    getStatus: vi.fn(() => ({
      state: 'idle',
      duration: 0,
      feedbackCount: 0,
      screenshotCount: 0,
      isPaused: false,
    })),
    getSession: vi.fn(() => null),
  },
}));

import { registerSessionHandlers } from '../../../src/main/ipc/sessionHandlers';
import { IPC_CHANNELS } from '../../../src/shared/types';
import { sessionController } from '../../../src/main/SessionController';
import type { IpcContext, SessionActions } from '../../../src/main/ipc/types';

function makeCtx(): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => null,
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: vi.fn(),
  };
}

function makeActions(): SessionActions {
  return {
    startSession: vi.fn(async () => ({ success: true, sessionId: 'test-id' })),
    stopSession: vi.fn(async () => ({ success: true })),
    pauseSession: vi.fn(() => ({ success: true })),
    resumeSession: vi.fn(() => ({ success: true })),
    cancelSession: vi.fn(() => ({ success: true })),
    serializeSession: vi.fn((s) => s as never),
    checkPermission: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
  };
}

describe('registerSessionHandlers', () => {
  let actions: SessionActions;

  beforeEach(() => {
    handlers.clear();
    actions = makeActions();
    registerSessionHandlers(makeCtx(), actions);
  });

  it('registers all expected IPC channels', () => {
    expect(handlers.has(IPC_CHANNELS.SESSION_START)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_STOP)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_PAUSE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_RESUME)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_CANCEL)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_GET_STATUS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_GET_CURRENT)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.START_SESSION)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.STOP_SESSION)).toBe(true);
  });

  it('SESSION_START delegates to actions.startSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_START)!;
    const result = await handler({}, 'screen:0', 'Display 1');

    expect(actions.startSession).toHaveBeenCalledWith('screen:0', 'Display 1');
    expect(result).toEqual({ success: true, sessionId: 'test-id' });
  });

  it('SESSION_START returns error on failure', async () => {
    vi.mocked(actions.startSession).mockRejectedValueOnce(new Error('No permission'));
    const handler = handlers.get(IPC_CHANNELS.SESSION_START)!;
    const result = await handler({});

    expect(result).toEqual({ success: false, error: 'No permission' });
  });

  it('SESSION_STOP delegates to actions.stopSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_STOP)!;
    await handler({});

    expect(actions.stopSession).toHaveBeenCalled();
  });

  it('SESSION_STOP returns error on failure', async () => {
    vi.mocked(actions.stopSession).mockRejectedValueOnce(new Error('busy'));
    const handler = handlers.get(IPC_CHANNELS.SESSION_STOP)!;
    const result = await handler({});

    expect(result).toEqual({ success: false, error: 'busy' });
  });

  it('SESSION_PAUSE delegates to actions.pauseSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_PAUSE)!;
    await handler({});

    expect(actions.pauseSession).toHaveBeenCalled();
  });

  it('SESSION_RESUME delegates to actions.resumeSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_RESUME)!;
    await handler({});

    expect(actions.resumeSession).toHaveBeenCalled();
  });

  it('SESSION_CANCEL delegates to actions.cancelSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_CANCEL)!;
    await handler({});

    expect(actions.cancelSession).toHaveBeenCalled();
  });

  it('SESSION_GET_STATUS returns controller status', () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_GET_STATUS)!;
    const result = handler();

    expect(sessionController.getStatus).toHaveBeenCalled();
    expect(result).toEqual({
      state: 'idle', duration: 0, feedbackCount: 0, screenshotCount: 0, isPaused: false,
    });
  });

  it('SESSION_GET_STATUS returns fallback on error', () => {
    vi.mocked(sessionController.getStatus).mockImplementationOnce(() => { throw new Error('boom'); });
    const handler = handlers.get(IPC_CHANNELS.SESSION_GET_STATUS)!;
    const result = handler();

    expect(result).toEqual({
      state: 'idle', duration: 0, feedbackCount: 0, screenshotCount: 0, isPaused: false,
    });
  });

  it('SESSION_GET_CURRENT returns null when no session', () => {
    const handler = handlers.get(IPC_CHANNELS.SESSION_GET_CURRENT)!;
    const result = handler();

    expect(result).toBeNull();
  });

  it('SESSION_GET_CURRENT serializes active session', () => {
    const session = { id: 'test', state: 'recording' };
    vi.mocked(sessionController.getSession).mockReturnValueOnce(session as never);
    vi.mocked(actions.serializeSession).mockReturnValueOnce({ id: 'test' } as never);

    const handler = handlers.get(IPC_CHANNELS.SESSION_GET_CURRENT)!;
    const result = handler();

    expect(actions.serializeSession).toHaveBeenCalledWith(session);
    expect(result).toEqual({ id: 'test' });
  });

  it('legacy START_SESSION delegates to startSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.START_SESSION)!;
    await handler({}, 'source-id');

    expect(actions.startSession).toHaveBeenCalledWith('source-id');
  });

  it('legacy STOP_SESSION delegates to stopSession', async () => {
    const handler = handlers.get(IPC_CHANNELS.STOP_SESSION)!;
    await handler({});

    expect(actions.stopSession).toHaveBeenCalled();
  });

  it('handles non-Error thrown objects', async () => {
    vi.mocked(actions.startSession).mockRejectedValueOnce('string error');
    const handler = handlers.get(IPC_CHANNELS.SESSION_START)!;
    const result = await handler({});

    expect(result).toEqual({ success: false, error: 'Failed to start session' });
  });
});
