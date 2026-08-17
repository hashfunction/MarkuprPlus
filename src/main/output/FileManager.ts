/**
 * File Manager Module
 *
 * Handles:
 * - Saving feedback documents to organized folder structure
 * - Saving screenshots alongside Markdown
 * - File naming and conflict resolution
 * - Default output: ~/Documents/markuprx/
 * - Custom output directory support
 */

import { app, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Session, Screenshot } from '../SessionController';
import { resolveContainedExistingPath } from '../security/pathContainment';

export const SESSION_OWNERSHIP_SENTINEL = '.markuprx-session.json';

interface SessionOwnershipSentinel {
  version: 1;
  sessionId: string;
}

/**
 * Result of saving a session to disk
 */
export interface SaveResult {
  success: boolean;
  sessionDir: string;
  markdownPath: string;
  summaryPath: string;
  screenshotPaths: string[];
  metadataPath: string;
  error?: string;
}

/**
 * Markdown document generated from a session
 */
export interface MarkdownDocument {
  content: string;
  metadata: {
    itemCount: number;
    screenshotCount: number;
    types: string[];
  };
}

/**
 * Session metadata stored in metadata.json
 */
interface StoredSessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  itemCount: number;
  screenshotCount: number;
  source: {
    id: string;
    name?: string;
  };
  environment: {
    os: string;
    version: string;
  };
  captureContexts?: Session['metadata']['captureContexts'];
  markedIssues?: Session['metadata']['markedIssues'];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500;
}

function isStoredSessionMetadata(value: unknown): value is StoredSessionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  const source = metadata.source as Record<string, unknown> | undefined;
  const environment = metadata.environment as Record<string, unknown> | undefined;
  return isNonEmptyString(metadata.sessionId)
    && typeof metadata.startTime === 'number'
    && Number.isFinite(metadata.startTime)
    && typeof metadata.itemCount === 'number'
    && Number.isInteger(metadata.itemCount)
    && metadata.itemCount >= 0
    && typeof metadata.screenshotCount === 'number'
    && Number.isInteger(metadata.screenshotCount)
    && metadata.screenshotCount >= 0
    && Boolean(source)
    && isNonEmptyString(source?.id)
    && Boolean(environment)
    && isNonEmptyString(environment?.os)
    && isNonEmptyString(environment?.version);
}

async function readRegularJson(pathname: string): Promise<unknown | null> {
  try {
    const stats = await fs.lstat(pathname);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;
    return JSON.parse(await fs.readFile(pathname, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function isRegularFile(pathname: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(pathname);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isOwnedSessionDirectory(directory: string): Promise<boolean> {
  const sentinel = await readRegularJson(path.join(directory, SESSION_OWNERSHIP_SENTINEL));
  if (sentinel && typeof sentinel === 'object' && !Array.isArray(sentinel)) {
    const record = sentinel as Partial<SessionOwnershipSentinel>;
    if (record.version === 1 && isNonEmptyString(record.sessionId)) return true;
  }

  const metadata = await readRegularJson(path.join(directory, 'metadata.json'));
  if (!isStoredSessionMetadata(metadata)) return false;
  return (await isRegularFile(path.join(directory, 'feedback-report.md')))
    && (await isRegularFile(path.join(directory, 'feedback-summary.md')));
}

/**
 * FileManager handles all file system operations for feedback sessions
 */
export class FileManager {
  private outputDirectory: string;

  constructor() {
    // Default: ~/Documents/markuprx/
    this.outputDirectory = path.join(
      app.getPath('documents'),
      'markuprx'
    );
  }

  /**
   * Set a custom output directory
   */
  setOutputDirectory(dir: string): void {
    this.outputDirectory = dir;
  }

  /**
   * Get the current output directory
   */
  getOutputDirectory(): string {
    return this.outputDirectory;
  }

  /**
   * Save a complete session to disk
   */
  async saveSession(session: Session, document: MarkdownDocument): Promise<SaveResult> {
    try {
      // Ensure base output directory exists
      await fs.mkdir(this.outputDirectory, { recursive: true });

      // Create session directory with conflict handling
      const sessionDir = await this.createSessionDirectory(session);
      const screenshotsDir = path.join(sessionDir, 'screenshots');
      await fs.mkdir(screenshotsDir, { recursive: true });

      // Collect all screenshots from feedback items
      const allScreenshots: Array<{ screenshot: Screenshot; itemIndex: number }> = [];
      session.feedbackItems.forEach((item, index) => {
        if (item.screenshot) {
          allScreenshots.push({ screenshot: item.screenshot, itemIndex: index });
        }
      });

      // Save screenshots first (so markdown can reference them)
      const screenshotPaths: string[] = [];
      for (let i = 0; i < allScreenshots.length; i++) {
        const { screenshot, itemIndex } = allScreenshots[i];
        const filename = `fb-${(itemIndex + 1).toString().padStart(3, '0')}.png`;
        const screenshotPath = await this.saveScreenshot(screenshot, screenshotsDir, filename);
        screenshotPaths.push(screenshotPath);
      }

      // Generate markdown with local screenshot paths
      const markdownWithLocalPaths = this.convertToLocalPaths(
        document.content,
        allScreenshots.map((s) => s.screenshot),
        screenshotPaths
      );

      // Save main feedback report
      const markdownPath = path.join(sessionDir, 'feedback-report.md');
      await fs.writeFile(markdownPath, markdownWithLocalPaths, 'utf-8');

      // Save summary (for clipboard reference)
      const summaryPath = path.join(sessionDir, 'feedback-summary.md');
      const summary = this.generateSummaryContent(session, document.metadata);
      await fs.writeFile(summaryPath, summary, 'utf-8');

      // Save metadata
      const metadataPath = path.join(sessionDir, 'metadata.json');
      await this.saveMetadata(session, document, metadataPath);

      console.log(`[FileManager] Session saved to ${sessionDir}`);

      return {
        success: true,
        sessionDir,
        markdownPath,
        summaryPath,
        screenshotPaths,
        metadataPath,
      };
    } catch (error) {
      console.error('[FileManager] Save failed:', error);
      return {
        success: false,
        sessionDir: '',
        markdownPath: '',
        summaryPath: '',
        screenshotPaths: [],
        metadataPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Save a single screenshot to disk
   */
  async saveScreenshot(screenshot: Screenshot, dir: string, filename: string): Promise<string> {
    const filePath = path.join(dir, filename);

    // Prefer the raw buffer if available (most efficient)
    if (screenshot.buffer) {
      await fs.writeFile(filePath, screenshot.buffer);
    } else if (screenshot.base64) {
      // Fall back to base64 data URL conversion
      const base64Data = screenshot.base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(filePath, buffer);
    } else {
      throw new Error(`Screenshot ${screenshot.id} has no image data`);
    }

    return filePath;
  }

  /**
   * Open the output folder in the system file manager
   */
  openOutputFolder(sessionDir: string): void {
    shell.openPath(sessionDir);
  }

  /**
   * Clean up old sessions beyond the max age
   */
  async cleanup(maxAgeDays: number): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    try {
      // Check if output directory exists
      try {
        await fs.access(this.outputDirectory);
      } catch {
        // Directory doesn't exist, nothing to clean
        return 0;
      }

      const entries = await fs.readdir(this.outputDirectory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(this.outputDirectory, entry.name);
        const metadataPath = path.join(dirPath, 'metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: StoredSessionMetadata = JSON.parse(metadataContent);

          if (metadata.startTime < cutoff) {
            await fs.rm(dirPath, { recursive: true });
            deleted++;
            console.log(`[FileManager] Cleaned up old session: ${entry.name}`);
          }
        } catch {
          // Skip directories without valid metadata
          // Could be user-created folders or corrupted sessions
        }
      }
    } catch (error) {
      console.error('[FileManager] Cleanup failed:', error);
    }

    return deleted;
  }

  /**
   * List all saved sessions
   */
  async listSessions(): Promise<Array<{ dir: string; metadata: StoredSessionMetadata }>> {
    const sessions: Array<{ dir: string; metadata: StoredSessionMetadata }> = [];

    try {
      try {
        await fs.access(this.outputDirectory);
      } catch {
        return sessions;
      }

      const entries = await fs.readdir(this.outputDirectory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(this.outputDirectory, entry.name);
        const metadataPath = path.join(dirPath, 'metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: StoredSessionMetadata = JSON.parse(metadataContent);
          sessions.push({ dir: dirPath, metadata });
        } catch {
          // Skip invalid directories
        }
      }

      // Sort by start time, newest first
      sessions.sort((a, b) => b.metadata.startTime - a.metadata.startTime);
    } catch (error) {
      console.error('[FileManager] Failed to list sessions:', error);
    }

    return sessions;
  }

  /**
   * Fail-closed discovery for the destructive Clear All Data operation.
   * Unlike listSessions(), filesystem errors are not converted into an empty
   * success result and only directories with app-owned evidence are returned.
   */
  async listOwnedSessionDirectoriesForDeletion(): Promise<string[]> {
    try {
      await fs.access(this.outputDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const entries = await fs.readdir(this.outputDirectory, { withFileTypes: true });
    const owned: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const candidate = path.join(this.outputDirectory, entry.name);
      const realCandidate = await resolveContainedExistingPath(this.outputDirectory, candidate);
      if (!realCandidate) continue;
      const stats = await fs.lstat(candidate);
      if (!stats.isDirectory() || stats.isSymbolicLink()) continue;
      if (await isOwnedSessionDirectory(realCandidate)) owned.push(realCandidate);
    }
    return owned.sort();
  }

  /**
   * Create a unique session directory
   */
  private async createSessionDirectory(session: Session): Promise<string> {
    const date = new Date(session.startTime);

    // Format: YYYYMMDD-HHMMSS
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');

    const timeStr = [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join('');

    // Sanitize project name: lowercase, remove special chars, limit length
    const projectName = (session.metadata?.sourceName || 'feedback')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') // Trim leading/trailing dashes
      .slice(0, 30) || 'feedback';

    const baseDirName = `${projectName}-${dateStr}-${timeStr}`;
    const sentinel: SessionOwnershipSentinel = { version: 1, sessionId: session.id };
    for (let counter = 0; counter < 10_000; counter++) {
      const suffix = counter === 0 ? '' : `-${counter}`;
      const sessionDir = path.join(this.outputDirectory, `${baseDirName}${suffix}`);
      try {
        // A non-recursive mkdir is the exclusive ownership claim. Never clean
        // a directory that this call did not create.
        await fs.mkdir(sessionDir, { recursive: false, mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }

      try {
        await fs.writeFile(
          path.join(sessionDir, SESSION_OWNERSHIP_SENTINEL),
          JSON.stringify(sentinel),
          { encoding: 'utf8', flag: 'wx', mode: 0o600 },
        );
        return sessionDir;
      } catch (error) {
        // rmdir succeeds only while the exclusively-created directory remains
        // empty. If anything else appeared, leave it intact for inspection.
        await fs.rmdir(sessionDir).catch(() => undefined);
        throw error;
      }
    }
    throw new Error('Unable to allocate a unique session directory.');
  }

  /**
   * Save session metadata as JSON
   */
  private async saveMetadata(
    session: Session,
    document: MarkdownDocument,
    metadataPath: string
  ): Promise<void> {
    const metadata: StoredSessionMetadata = {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.endTime ? session.endTime - session.startTime : undefined,
      itemCount: document.metadata.itemCount,
      screenshotCount: document.metadata.screenshotCount,
      source: {
        id: session.sourceId,
        name: session.metadata?.sourceName,
      },
      environment: {
        os: process.platform,
        version: app.getVersion(),
      },
      captureContexts: session.metadata?.captureContexts?.slice(-400),
      markedIssues: structuredClone(session.metadata?.markedIssues ?? []),
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Generate a short summary for quick reference
   */
  private generateSummaryContent(
    session: Session,
    metadata?: MarkdownDocument['metadata']
  ): string {
    const { feedbackItems, startTime, endTime } = session;
    const duration = endTime ? Math.round((endTime - startTime) / 1000) : 0;
    const feedbackItemCount = feedbackItems.length;
    const feedbackScreenshotCount = feedbackItems.filter((item) => item.screenshot).length;
    const itemCount = Math.max(feedbackItemCount, metadata?.itemCount ?? 0);
    const screenshotCount = Math.max(feedbackScreenshotCount, metadata?.screenshotCount ?? 0);

    let summary = '# Quick Summary\n\n';
    summary += `**Items:** ${itemCount}\n`;
    summary += `**Screenshots:** ${screenshotCount}\n`;
    summary += `**Duration:** ${duration}s\n\n`;

    // List feedback items (truncated)
    if (feedbackItems.length > 0) {
      summary += '## Feedback Points\n\n';
      feedbackItems.forEach((item, i) => {
        const text = item.text.slice(0, 100);
        const ellipsis = item.text.length > 100 ? '...' : '';
        const hasScreenshot = item.screenshot ? ' [img]' : '';
        summary += `${i + 1}. ${text}${ellipsis}${hasScreenshot}\n`;
      });
    }

    return summary;
  }

  /**
   * Convert base64 image references to local file paths in markdown
   */
  private convertToLocalPaths(
    markdown: string,
    screenshots: Screenshot[],
    savedPaths: string[]
  ): string {
    let result = markdown;

    // Replace base64 data URLs with relative paths
    screenshots.forEach((screenshot, index) => {
      if (screenshot.base64 && savedPaths[index]) {
        // Get relative path from session dir to screenshot
        const relativePath = `screenshots/${path.basename(savedPaths[index])}`;
        result = result.replace(screenshot.base64, relativePath);
      }
    });

    return result;
  }
}

// Export singleton instance
export const fileManager = new FileManager();

export default FileManager;
