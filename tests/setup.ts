/**
 * Test Setup - Global mocks and configuration for markuprx tests
 *
 * This file sets up common mocks for Electron modules and other
 * dependencies that don't work in a Node.js test environment.
 */

import { vi } from 'vitest';

// =============================================================================
// Electron Module Mocks
// =============================================================================

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/tmp/test-userdata',
        documents: '/tmp/test-documents',
        desktop: '/tmp/test-desktop',
        downloads: '/tmp/test-downloads',
        temp: '/tmp/test-temp',
      };
      return paths[name] || '/tmp/test';
    }),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '2.0.0'),
    getAppPath: vi.fn(() => '/mock/app/path'),
    isReady: vi.fn(() => true),
    isPackaged: false,
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },

  BrowserWindow: vi.fn().mockImplementation((options: { width?: number; height?: number } = {}) => ({
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    focus: vi.fn(),
    blur: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    getBounds: vi.fn(() => ({
      x: 0,
      y: 0,
      width: options.width ?? 800,
      height: options.height ?? 600,
    })),
    isVisible: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVibrancy: vi.fn(),
    setBackgroundColor: vi.fn(),
    setHasShadow: vi.fn(),
    setContentProtection: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      openDevTools: vi.fn(),
      printToPDF: vi.fn(() => Promise.resolve(Buffer.from('PDF content'))),
      executeJavaScript: vi.fn(() => Promise.resolve()),
    },
  })),

  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },

  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },

  screen: {
    getAllDisplays: vi.fn(() => [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 23, width: 1920, height: 1057 },
        scaleFactor: 2,
        rotation: 0,
        internal: false,
      },
    ]),
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 23, width: 1920, height: 1057 },
      scaleFactor: 2,
      rotation: 0,
      internal: false,
    })),
  },

  desktopCapturer: {
    getSources: vi.fn(() =>
      Promise.resolve([
        {
          id: 'screen:0:0',
          name: 'Entire Screen',
          thumbnail: { toDataURL: () => 'data:image/png;base64,mock' },
          display_id: '1',
          appIcon: null,
        },
        {
          id: 'window:123:0',
          name: 'Test Window',
          thumbnail: { toDataURL: () => 'data:image/png;base64,mock' },
          display_id: '',
          appIcon: { toDataURL: () => 'data:image/png;base64,icon' },
        },
      ])
    ),
  },

  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(() => ''),
    writeImage: vi.fn(),
    readImage: vi.fn(),
    clear: vi.fn(),
  },

  shell: {
    openPath: vi.fn(() => Promise.resolve('')),
    openExternal: vi.fn(() => Promise.resolve()),
    showItemInFolder: vi.fn(),
  },

  dialog: {
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: ['/mock/path'] })),
    showSaveDialog: vi.fn(() => Promise.resolve({ canceled: false, filePath: '/mock/save/path' })),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
  },

  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  })),

  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => true),
  },

  Tray: vi.fn().mockImplementation(() => ({
    setImage: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),

  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },

  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      getSize: () => ({ width: 32, height: 32 }),
      toDataURL: () => 'data:image/png;base64,mock',
      resize: vi.fn(() => ({
        toPNG: () => Buffer.from('PNG'),
        getSize: () => ({ width: 32, height: 32 }),
      })),
    })),
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1920, height: 1080 }),
      toDataURL: () => 'data:image/png;base64,mock',
      toPNG: () => Buffer.from('PNG'),
      toJPEG: () => Buffer.from('JPEG'),
      resize: vi.fn(() => ({
        toPNG: () => Buffer.from('resized-PNG'),
        getSize: () => ({ width: 1200, height: 675 }),
      })),
    })),
    createEmpty: vi.fn(() => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
    })),
  },

  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'granted'),
    askForMediaAccess: vi.fn(() => Promise.resolve(true)),
    isTrustedAccessibilityClient: vi.fn(() => true),
  },

  powerMonitor: {
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

// =============================================================================
// electron-store Mock
// =============================================================================

vi.mock('electron-store', () => {
  const mockStore = new Map<string, unknown>();

  return {
    default: vi.fn().mockImplementation((options?: { defaults?: Record<string, unknown> }) => {
      // Initialize with defaults
      if (options?.defaults) {
        Object.entries(options.defaults).forEach(([key, value]) => {
          mockStore.set(key, value);
        });
      }

      return {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          return mockStore.has(key) ? mockStore.get(key) : defaultValue;
        }),
        set: vi.fn((key: string, value: unknown) => {
          mockStore.set(key, value);
        }),
        delete: vi.fn((key: string) => {
          mockStore.delete(key);
        }),
        clear: vi.fn(() => {
          mockStore.clear();
        }),
        has: vi.fn((key: string) => mockStore.has(key)),
        store: Object.fromEntries(mockStore),
        path: '/tmp/test-store.json',
        size: mockStore.size,
      };
    }),
  };
});

// =============================================================================
// keytar Mock (Secure Storage)
// =============================================================================

vi.mock('keytar', () => {
  const mockKeychain = new Map<string, string>();

  return {
    default: {
      getPassword: vi.fn((service: string, account: string) => {
        const key = `${service}:${account}`;
        return Promise.resolve(mockKeychain.get(key) || null);
      }),
      setPassword: vi.fn((service: string, account: string, password: string) => {
        const key = `${service}:${account}`;
        mockKeychain.set(key, password);
        return Promise.resolve();
      }),
      deletePassword: vi.fn((service: string, account: string) => {
        const key = `${service}:${account}`;
        const had = mockKeychain.has(key);
        mockKeychain.delete(key);
        return Promise.resolve(had);
      }),
    },
  };
});

// =============================================================================
// sharp Mock (Image Processing)
// =============================================================================

vi.mock('sharp', () => {
  const mockSharpInstance = {
    metadata: vi.fn(() =>
      Promise.resolve({
        width: 1920,
        height: 1080,
        format: 'png',
        size: 1024000,
      })
    ),
    resize: vi.fn(function (this: typeof mockSharpInstance) {
      return this;
    }),
    png: vi.fn(function (this: typeof mockSharpInstance) {
      return this;
    }),
    jpeg: vi.fn(function (this: typeof mockSharpInstance) {
      return this;
    }),
    toBuffer: vi.fn(() => Promise.resolve(Buffer.from('mock-image'))),
    toFile: vi.fn(() => Promise.resolve({ width: 1920, height: 1080, size: 102400 })),
    composite: vi.fn(function (this: typeof mockSharpInstance) {
      return this;
    }),
  };

  return {
    default: vi.fn(() => mockSharpInstance),
  };
});

// =============================================================================
// electron-log Mock
// =============================================================================

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(console.log),
    warn: vi.fn(console.warn),
    error: vi.fn(console.error),
    debug: vi.fn(console.debug),
    verbose: vi.fn(console.log),
    transports: {
      file: {
        level: 'info',
        format: '{h}:{i}:{s} {text}',
        maxSize: 10 * 1024 * 1024,
        getFile: vi.fn(() => ({ path: '/tmp/test.log' })),
      },
      console: {
        level: 'debug',
      },
    },
  },
}));

// =============================================================================
// electron-updater Mock
// =============================================================================

vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve([])),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    setFeedURL: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: true,
  },
}));

// =============================================================================
// fs/promises Mock (Partial - for specific test cases)
// =============================================================================

// Note: We don't fully mock fs/promises as Vitest can handle real file operations
// in most cases. This provides targeted mocks for specific scenarios.

// =============================================================================
// Performance timing (ensure consistent test timing)
// =============================================================================

vi.stubGlobal('performance', {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByName: vi.fn(() => []),
  getEntriesByType: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
});

// =============================================================================
// Console Suppression (Optional)
// =============================================================================

// Uncomment to suppress console output during tests:
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});
// vi.spyOn(console, 'error').mockImplementation(() => {});

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock FeedbackSession for testing
 */
export function createMockFeedbackSession(overrides: Partial<{
  id: string;
  startedAt: number;
  endedAt: number;
  screenshotCount: number;
  transcriptionCount: number;
}> = {}) {
  const now = Date.now();
  const id = overrides.id || `test-session-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    startedAt: overrides.startedAt || now - 120000,
    endedAt: overrides.endedAt || now,
    status: 'complete' as const,
    screenshots: Array.from({ length: overrides.screenshotCount || 2 }, (_, i) => ({
      id: `screenshot-${i + 1}`,
      timestamp: now - 60000 + i * 30000,
      imagePath: `/tmp/screenshot-${i + 1}.png`,
      width: 1920,
      height: 1080,
    })),
    transcription: Array.from({ length: overrides.transcriptionCount || 3 }, (_, i) => ({
      id: `segment-${i + 1}`,
      text: `Test transcription segment ${i + 1}.`,
      startTime: now - 90000 + i * 30000,
      endTime: now - 85000 + i * 30000,
      confidence: 0.95 - i * 0.02,
      isFinal: true,
    })),
  };
}

/**
 * Create a mock Session for MarkdownGenerator testing
 */
export function createMockSession(overrides: Partial<{
  id: string;
  itemCount: number;
  withScreenshots: boolean;
}> = {}) {
  const now = Date.now();
  const id = overrides.id || `test-session-${Math.random().toString(36).slice(2)}`;
  const itemCount = overrides.itemCount ?? 3;
  const withScreenshots = overrides.withScreenshots ?? true;

  return {
    id,
    startTime: now - 300000, // 5 minutes ago
    endTime: now,
    feedbackItems: Array.from({ length: itemCount }, (_, i) => ({
      id: `item-${i + 1}`,
      transcription: `Feedback item ${i + 1}: This is test feedback content.`,
      timestamp: now - 240000 + i * 60000,
      screenshots: withScreenshots
        ? [
            {
              id: `ss-${i + 1}`,
              timestamp: now - 235000 + i * 60000,
              imagePath: `/tmp/ss-${i + 1}.png`,
              width: 1920,
              height: 1080,
            },
          ]
        : [],
      category: (['Bug', 'UX Issue', 'Suggestion'] as const)[i % 3],
    })),
    metadata: {
      os: 'darwin',
      sourceName: 'Test Application',
      sourceType: 'window' as const,
    },
  };
}

/**
 * Wait for a condition to be true (with timeout)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Flush all pending promises and timers
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
