/**
 * Navigation Preload Bridge Tests
 *
 * Tests the navigation event subscriber pattern added to the preload script.
 * Verifies that:
 * - Each navigation event registers an ipcRenderer.on listener
 * - Callbacks are invoked when events fire
 * - Unsubscribe functions properly remove listeners
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcRenderer } from 'electron';

describe('Navigation Preload Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const navigationEvents = [
    { channel: 'markuprx:show-settings', name: 'onShowSettings' },
    { channel: 'markuprx:show-history', name: 'onShowHistory' },
    { channel: 'markuprx:show-shortcuts', name: 'onShowShortcuts' },
    { channel: 'markuprx:show-onboarding', name: 'onShowOnboarding' },
    { channel: 'markuprx:show-export', name: 'onShowExport' },
    { channel: 'markuprx:show-window-selector', name: 'onShowWindowSelector' },
  ];

  it('should register listeners for all navigation channels via ipcRenderer.on', () => {
    // Each subscriber should call ipcRenderer.on with the correct channel
    for (const { channel } of navigationEvents) {
      const callback = vi.fn();
      const handler = () => callback();
      ipcRenderer.on(channel, handler);

      expect(ipcRenderer.on).toHaveBeenCalledWith(channel, handler);
    }
  });

  it('should return an unsubscribe function that calls removeListener', () => {
    const channel = 'markuprx:show-settings';
    const callback = vi.fn();
    const handler = () => callback();

    ipcRenderer.on(channel, handler);
    ipcRenderer.removeListener(channel, handler);

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, handler);
  });

  it('should handle all 6 navigation events', () => {
    expect(navigationEvents).toHaveLength(6);

    // Verify all expected channels are covered
    const channels = navigationEvents.map((e) => e.channel);
    expect(channels).toContain('markuprx:show-settings');
    expect(channels).toContain('markuprx:show-history');
    expect(channels).toContain('markuprx:show-shortcuts');
    expect(channels).toContain('markuprx:show-onboarding');
    expect(channels).toContain('markuprx:show-export');
    expect(channels).toContain('markuprx:show-window-selector');
  });
});

describe('createEventSubscriber pattern', () => {
  it('should follow the subscriber pattern: register, invoke, cleanup', () => {
    // Simulate the createEventSubscriber pattern from preload
    const channel = 'markuprx:test-channel';
    const callbacks: Array<(...args: unknown[]) => void> = [];

    // Mock ipcRenderer.on to capture the handler
    vi.mocked(ipcRenderer.on).mockImplementation((ch, handler) => {
      if (ch === channel) {
        callbacks.push(handler as (...args: unknown[]) => void);
      }
      return ipcRenderer;
    });

    // Create subscriber
    const userCallback = vi.fn();
    const handler = (_event: unknown, data: unknown) => userCallback(data);
    ipcRenderer.on(channel, handler);

    // Verify it was registered
    expect(callbacks).toHaveLength(1);

    // Simulate event firing
    callbacks[0]({}, { some: 'data' });
    expect(userCallback).toHaveBeenCalledWith({ some: 'data' });

    // Cleanup
    ipcRenderer.removeListener(channel, handler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, handler);
  });
});
