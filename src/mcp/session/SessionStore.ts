/**
 * Session Store — Disk-persisted session lifecycle management.
 *
 * Storage layout:
 *   ~/Documents/markuprx/mcp/
 *     mcp-YYYYMMDD-HHMMSS/
 *       metadata.json   — McpSessionMetadata
 *       screenshots/     — captured frames
 *       ...
 *
 * Uses os.homedir() — NO Electron dependencies.
 * Directory naming mirrors FileManager pattern (src/main/output/FileManager.ts).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { log } from '../utils/Logger.js';
import type { McpSession, McpSessionMetadata } from '../types.js';

const BASE_DIR = path.join(os.homedir(), 'Documents', 'markuprx', 'mcp');

export class SessionStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? BASE_DIR;
  }

  /**
   * Create a new session directory with metadata.json.
   */
  async create(label?: string): Promise<McpSession> {
    await fs.mkdir(this.baseDir, { recursive: true });

    const now = Date.now();
    const id = this.formatSessionId(now);
    const sessionDir = path.join(this.baseDir, id);

    // Handle conflicts by appending counter
    let finalDir = sessionDir;
    let counter = 1;
    while (await this.exists(finalDir)) {
      finalDir = path.join(this.baseDir, `${id}-${counter}`);
      counter++;
    }

    const finalId = path.basename(finalDir);
    await fs.mkdir(finalDir, { recursive: true });
    await fs.mkdir(path.join(finalDir, 'screenshots'), { recursive: true });

    const session: McpSession = {
      id: finalId,
      startTime: now,
      label,
      status: 'recording',
    };

    const metadata: McpSessionMetadata = { ...session };
    await this.writeMetadata(finalDir, metadata);

    log(`Session created: ${finalId}`);
    return session;
  }

  /**
   * Read a session's metadata by ID.
   */
  async get(id: string): Promise<McpSessionMetadata | null> {
    const metadataPath = path.join(this.baseDir, id, 'metadata.json');
    try {
      const raw = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(raw) as McpSessionMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Return the most recent session (by startTime).
   */
  async getLatest(): Promise<McpSessionMetadata | null> {
    const sessions = await this.list();
    return sessions[0] ?? null;
  }

  /**
   * List all sessions sorted by startTime descending.
   */
  async list(): Promise<McpSessionMetadata[]> {
    const sessions: McpSessionMetadata[] = [];

    try {
      await fs.access(this.baseDir);
    } catch {
      return sessions;
    }

    let entries;
    try {
      entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    } catch {
      return sessions;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metadataPath = path.join(this.baseDir, entry.name, 'metadata.json');
      try {
        const raw = await fs.readFile(metadataPath, 'utf-8');
        const session = JSON.parse(raw) as McpSessionMetadata;
        sessions.push(session);
      } catch {
        // Skip directories without valid metadata
      }
    }

    sessions.sort((a, b) => b.startTime - a.startTime);
    return sessions;
  }

  /**
   * Update a session's metadata (partial merge).
   */
  async update(id: string, data: Partial<McpSessionMetadata>): Promise<void> {
    const sessionDir = path.join(this.baseDir, id);
    const metadataPath = path.join(sessionDir, 'metadata.json');

    let existing: McpSessionMetadata;
    try {
      const raw = await fs.readFile(metadataPath, 'utf-8');
      existing = JSON.parse(raw) as McpSessionMetadata;
    } catch {
      throw new Error(`Session not found: ${id}`);
    }

    const updated: McpSessionMetadata = { ...existing, ...data };
    await this.writeMetadata(sessionDir, updated);
    log(`Session updated: ${id}`);
  }

  /**
   * Get the absolute path to a session directory.
   */
  getSessionDir(id: string): string {
    return path.join(this.baseDir, id);
  }

  /**
   * Format a timestamp into the session ID pattern: mcp-YYYYMMDD-HHMMSS
   */
  private formatSessionId(timestamp: number): string {
    const date = new Date(timestamp);

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

    return `mcp-${dateStr}-${timeStr}`;
  }

  private async writeMetadata(sessionDir: string, metadata: McpSessionMetadata): Promise<void> {
    const metadataPath = path.join(sessionDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private async exists(dir: string): Promise<boolean> {
    try {
      await fs.access(dir);
      return true;
    } catch {
      return false;
    }
  }
}

export const sessionStore = new SessionStore();
