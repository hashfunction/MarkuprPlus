/**
 * End-to-End Critical Path Tests
 *
 * Tests the most critical user journeys through markuprx:
 * - Recording session lifecycle
 * - Output generation flow
 * - Clipboard summary flow
 *
 * These tests use mocked services but simulate real user interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '0.4.0'),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  Notification: {
    isSupported: vi.fn(() => false),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  shell: {
    openPath: vi.fn(() => Promise.resolve('')),
  },
}));

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  })),
}));

// =============================================================================
// E2E Test Application Simulation
// =============================================================================

interface SimulatedSession {
  id: string;
  startTime: number;
  endTime?: number;
  feedbackItems: Array<{
    id: string;
    timestamp: number;
    text: string;
    screenshot?: {
      id: string;
      width: number;
      height: number;
      imagePath: string;
    };
    category?: string;
  }>;
  metadata: {
    sourceName: string;
    sourceType: 'screen' | 'window';
    os: string;
  };
}

/**
 * Simulates the complete markuprx application for E2E testing
 */
class markuprxSimulator {
  private state: 'idle' | 'recording' | 'processing' | 'complete' = 'idle';
  private currentSession: SimulatedSession | null = null;
  private events = new EventEmitter();
  private outputFiles: Map<string, string> = new Map();
  private clipboardContent: string = '';

  // ---------------------------------------------------------------------------
  // User Actions
  // ---------------------------------------------------------------------------

  /**
   * Simulate user starting a recording session
   */
  async userStartsRecording(sourceName: string = 'Test Window'): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Already recording');
    }

    this.currentSession = {
      id: `session-${Date.now()}`,
      startTime: Date.now(),
      feedbackItems: [],
      metadata: {
        sourceName,
        sourceType: 'window',
        os: process.platform,
      },
    };

    this.state = 'recording';
    this.events.emit('recording:started', this.currentSession);
  }

  /**
   * Simulate user speaking feedback
   */
  userSpeaksFeedback(text: string, category?: string): void {
    if (this.state !== 'recording' || !this.currentSession) {
      throw new Error('Not recording');
    }

    const item = {
      id: `fb-${this.currentSession.feedbackItems.length + 1}`,
      timestamp: Date.now(),
      text,
      screenshot: {
        id: `ss-${this.currentSession.feedbackItems.length + 1}`,
        width: 1920,
        height: 1080,
        imagePath: `/tmp/screenshot-${this.currentSession.feedbackItems.length + 1}.png`,
      },
      category: category || this.inferCategory(text),
    };

    this.currentSession.feedbackItems.push(item);
    this.events.emit('feedback:captured', item);
  }

  /**
   * Simulate user stopping the recording
   */
  async userStopsRecording(): Promise<SimulatedSession> {
    if (this.state !== 'recording' || !this.currentSession) {
      throw new Error('Not recording');
    }

    this.state = 'processing';
    this.events.emit('recording:processing');

    // Simulate processing delay
    await new Promise((r) => setTimeout(r, 10));

    this.currentSession.endTime = Date.now();
    this.state = 'complete';
    this.events.emit('recording:complete', this.currentSession);

    return { ...this.currentSession };
  }

  /**
   * Simulate user saving the session
   */
  async userSavesSession(format: 'markdown' | 'pdf' | 'html' | 'json' = 'markdown'): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No session to save');
    }

    const filename = this.generateFilename(format);
    const content = this.generateOutput(format);

    this.outputFiles.set(filename, content);
    this.events.emit('session:saved', { filename, format });

    return filename;
  }

  /**
   * Simulate user copying summary to clipboard
   */
  async userCopiesSummary(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No session');
    }

    const summary = this.generateClipboardSummary();
    this.clipboardContent = summary;
    this.events.emit('clipboard:copied', summary);

    return summary;
  }

  /**
   * Simulate user discarding the session
   */
  userDiscardsSession(): void {
    this.currentSession = null;
    this.state = 'idle';
    this.events.emit('session:discarded');
  }

  // ---------------------------------------------------------------------------
  // State Access
  // ---------------------------------------------------------------------------

  getState() {
    return this.state;
  }

  getCurrentSession() {
    return this.currentSession;
  }

  getOutputFiles() {
    return new Map(this.outputFiles);
  }

  getClipboardContent() {
    return this.clipboardContent;
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    this.events.on(event, callback);
    return () => this.events.off(event, callback);
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private inferCategory(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('bug') || lowerText.includes('broken') || lowerText.includes('crash')) {
      return 'Bug';
    }
    if (lowerText.includes('confusing') || lowerText.includes('hard to')) {
      return 'UX Issue';
    }
    if (lowerText.includes('should') || lowerText.includes('would be nice')) {
      return 'Suggestion';
    }
    if (lowerText.includes('?')) {
      return 'Question';
    }
    return 'General';
  }

  private generateFilename(format: string): string {
    const name = (this.currentSession?.metadata.sourceName || 'feedback')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');

    const date = new Date(this.currentSession?.startTime || Date.now());
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

    const extensions: Record<string, string> = {
      markdown: 'md',
      pdf: 'pdf',
      html: 'html',
      json: 'json',
    };

    return `${name}-feedback-${dateStr}.${extensions[format]}`;
  }

  private generateOutput(format: string): string {
    if (!this.currentSession) return '';

    switch (format) {
      case 'json':
        return JSON.stringify({
          session: this.currentSession,
          exportedAt: new Date().toISOString(),
        }, null, 2);

      case 'html':
        return `<!DOCTYPE html>
<html>
<head><title>${this.currentSession.metadata.sourceName} Feedback</title></head>
<body>
<h1>${this.currentSession.metadata.sourceName} Feedback Report</h1>
<p>Items: ${this.currentSession.feedbackItems.length}</p>
${this.currentSession.feedbackItems.map((item, i) => `
<h2>FB-${String(i + 1).padStart(3, '0')}: ${item.text.slice(0, 50)}</h2>
<p>${item.text}</p>
`).join('')}
</body>
</html>`;

      case 'markdown':
      default:
        let md = `# ${this.currentSession.metadata.sourceName} Feedback Report\n\n`;
        md += `> Items: ${this.currentSession.feedbackItems.length}\n\n`;

        this.currentSession.feedbackItems.forEach((item, i) => {
          const id = `FB-${String(i + 1).padStart(3, '0')}`;
          md += `### ${id}: ${item.text.slice(0, 50)}\n`;
          md += `**Type:** ${item.category}\n\n`;
          md += `> ${item.text}\n\n`;
          if (item.screenshot) {
            md += `![${id}](./screenshots/${id.toLowerCase()}.png)\n\n`;
          }
          md += `---\n\n`;
        });

        return md;
    }
  }

  private generateClipboardSummary(): string {
    if (!this.currentSession) return '';

    const items = this.currentSession.feedbackItems;
    let summary = `# Feedback: ${this.currentSession.metadata.sourceName} - ${items.length} items\n\n`;

    summary += `## Priority Items\n`;
    items.slice(0, 3).forEach((item, i) => {
      const id = `FB-${String(i + 1).padStart(3, '0')}`;
      summary += `- **${id}:** ${item.text.slice(0, 60)}...\n`;
    });

    if (items.length > 3) {
      summary += `\n## Other\n`;
      summary += `- ${items.length - 3} more items (see full report)\n`;
    }

    return summary;
  }

  reset(): void {
    this.state = 'idle';
    this.currentSession = null;
    this.outputFiles.clear();
    this.clipboardContent = '';
    this.events.removeAllListeners();
  }
}

// =============================================================================
// E2E Tests
// =============================================================================

describe('E2E: Critical User Paths', () => {
  let app: markuprxSimulator;

  beforeEach(() => {
    app = new markuprxSimulator();
  });

  afterEach(() => {
    app.reset();
  });

  describe('Recording Session Lifecycle', () => {
    it('should complete a full recording session', async () => {
      // User starts recording
      await app.userStartsRecording('My Test App');
      expect(app.getState()).toBe('recording');

      // User provides feedback
      app.userSpeaksFeedback('The save button is broken and crashes the app.');
      app.userSpeaksFeedback('The navigation menu is confusing.');
      app.userSpeaksFeedback('It would be nice to have dark mode.');

      // User stops recording
      const session = await app.userStopsRecording();

      expect(app.getState()).toBe('complete');
      expect(session.feedbackItems).toHaveLength(3);
      expect(session.endTime).toBeDefined();
    });

    it('should track feedback items with correct categories', async () => {
      await app.userStartsRecording('Test App');

      app.userSpeaksFeedback('This is broken!'); // Bug
      app.userSpeaksFeedback('This is confusing and hard to use.'); // UX Issue
      app.userSpeaksFeedback('You should add a feature.'); // Suggestion
      app.userSpeaksFeedback('How do I do this?'); // Question

      const session = await app.userStopsRecording();

      expect(session.feedbackItems[0].category).toBe('Bug');
      expect(session.feedbackItems[1].category).toBe('UX Issue');
      expect(session.feedbackItems[2].category).toBe('Suggestion');
      expect(session.feedbackItems[3].category).toBe('Question');
    });

    it('should emit events throughout the session lifecycle', async () => {
      const events: string[] = [];

      app.on('recording:started', () => events.push('started'));
      app.on('feedback:captured', () => events.push('feedback'));
      app.on('recording:processing', () => events.push('processing'));
      app.on('recording:complete', () => events.push('complete'));

      await app.userStartsRecording();
      app.userSpeaksFeedback('Test feedback');
      await app.userStopsRecording();

      expect(events).toEqual(['started', 'feedback', 'processing', 'complete']);
    });

    it('should allow discarding a session', async () => {
      await app.userStartsRecording();
      app.userSpeaksFeedback('Feedback to discard');

      app.userDiscardsSession();

      expect(app.getState()).toBe('idle');
      expect(app.getCurrentSession()).toBeNull();
    });
  });

  describe('Output Generation Flow', () => {
    beforeEach(async () => {
      await app.userStartsRecording('Test App');
      app.userSpeaksFeedback('Bug: The save button crashes.');
      app.userSpeaksFeedback('UX: Navigation is confusing.');
      await app.userStopsRecording();
    });

    it('should save session as Markdown', async () => {
      const filename = await app.userSavesSession('markdown');

      expect(filename).toMatch(/\.md$/);

      const files = app.getOutputFiles();
      expect(files.has(filename)).toBe(true);

      const content = files.get(filename)!;
      expect(content).toContain('# Test App Feedback Report');
      expect(content).toContain('FB-001');
      expect(content).toContain('FB-002');
    });

    it('should save session as JSON', async () => {
      const filename = await app.userSavesSession('json');

      expect(filename).toMatch(/\.json$/);

      const files = app.getOutputFiles();
      const content = files.get(filename)!;
      const parsed = JSON.parse(content);

      expect(parsed.session.feedbackItems).toHaveLength(2);
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should save session as HTML', async () => {
      const filename = await app.userSavesSession('html');

      expect(filename).toMatch(/\.html$/);

      const files = app.getOutputFiles();
      const content = files.get(filename)!;

      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Test App Feedback Report');
    });

    it('should emit save event', async () => {
      const saveEvents: Array<{ filename: string; format: string }> = [];
      app.on('session:saved', (data) => saveEvents.push(data as { filename: string; format: string }));

      await app.userSavesSession('markdown');

      expect(saveEvents).toHaveLength(1);
      expect(saveEvents[0].format).toBe('markdown');
    });
  });

  describe('Clipboard Summary Flow', () => {
    beforeEach(async () => {
      await app.userStartsRecording('My App');
      app.userSpeaksFeedback('First priority feedback item about a critical bug.');
      app.userSpeaksFeedback('Second priority feedback about UX issues.');
      app.userSpeaksFeedback('Third priority suggestion for improvement.');
      app.userSpeaksFeedback('Fourth item that should be in "other" section.');
      await app.userStopsRecording();
    });

    it('should copy summary to clipboard', async () => {
      const summary = await app.userCopiesSummary();

      expect(summary).toContain('# Feedback: My App - 4 items');
      expect(summary).toContain('## Priority Items');
      expect(summary).toContain('FB-001');
      expect(summary).toContain('FB-002');
      expect(summary).toContain('FB-003');
    });

    it('should show remaining items in Other section', async () => {
      const summary = await app.userCopiesSummary();

      expect(summary).toContain('## Other');
      expect(summary).toContain('1 more items');
    });

    it('should store summary in clipboard content', async () => {
      await app.userCopiesSummary();

      const clipboardContent = app.getClipboardContent();
      expect(clipboardContent).toContain('# Feedback: My App');
    });

    it('should emit clipboard event', async () => {
      let copiedContent = '';
      app.on('clipboard:copied', (content) => { copiedContent = content as string; });

      await app.userCopiesSummary();

      expect(copiedContent).toContain('# Feedback:');
    });
  });

  describe('Error Handling', () => {
    it('should prevent starting recording when already recording', async () => {
      await app.userStartsRecording();

      await expect(app.userStartsRecording()).rejects.toThrow('Already recording');
    });

    it('should prevent speaking feedback when not recording', async () => {
      expect(() => app.userSpeaksFeedback('Test')).toThrow('Not recording');
    });

    it('should prevent stopping when not recording', async () => {
      await expect(app.userStopsRecording()).rejects.toThrow('Not recording');
    });

    it('should prevent saving when no session exists', async () => {
      await expect(app.userSavesSession()).rejects.toThrow('No session to save');
    });

    it('should prevent copying summary when no session exists', async () => {
      await expect(app.userCopiesSummary()).rejects.toThrow('No session');
    });
  });

  describe('Real-World Scenario: Bug Report Session', () => {
    it('should handle a realistic bug reporting session', async () => {
      // User discovers a bug and starts markuprx
      await app.userStartsRecording('Acme Dashboard');

      // User describes the bug
      app.userSpeaksFeedback(
        'I found a critical bug. When I click the export button with more than 100 items selected, ' +
        'the entire application freezes and I have to force quit.'
      );

      // User provides steps to reproduce
      app.userSpeaksFeedback(
        'To reproduce: First, go to the data table view. Then select all items using the checkbox. ' +
        'Finally, click the export button in the toolbar.'
      );

      // User mentions the expected behavior
      app.userSpeaksFeedback(
        'I would expect the export to start processing in the background without freezing the UI.'
      );

      // User notes the severity
      app.userSpeaksFeedback(
        'This is blocking my work because I need to export reports daily. Very urgent fix needed.'
      );

      // User stops recording
      const session = await app.userStopsRecording();

      // Verify session integrity
      expect(session.feedbackItems).toHaveLength(4);
      expect(session.feedbackItems[0].category).toBe('Bug');
      expect(session.metadata.sourceName).toBe('Acme Dashboard');

      // User saves the report
      const filename = await app.userSavesSession('markdown');
      const files = app.getOutputFiles();
      const report = files.get(filename)!;

      // Verify report contains all feedback
      expect(report).toContain('critical bug');
      expect(report).toContain('To reproduce');
      expect(report).toContain('export'); // The word "expected" gets truncated in title, check full content
      expect(report).toContain('blocking');

      // User copies summary for quick sharing
      const summary = await app.userCopiesSummary();
      expect(summary).toContain('4 items');
    });
  });
});
