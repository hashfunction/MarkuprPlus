/**
 * Tool: capture_screenshot
 *
 * Takes a screenshot of the current screen, optionally optimizes it,
 * and saves it to the session directory. Returns a markdown image reference.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { capture } from '../capture/ScreenCapture.js';
import { optimize } from '../utils/ImageOptimizer.js';
import { sessionStore } from '../session/SessionStore.js';
import { log } from '../utils/Logger.js';
import { captureContextSnapshot } from '../utils/CaptureContext.js';

export function register(server: McpServer): void {
  server.tool(
    'capture_screenshot',
    'Returns a saved PNG path, markdown image reference, and captured cursor/window context for the current screen.',
    {
      label: z.string().optional().describe('Optional label for the screenshot'),
      display: z.number().optional().default(1).describe('Display number (1-indexed)'),
      optimize: z.boolean().optional().default(true).describe('Optimize image size with sharp'),
    },
    async ({ label, display, optimize: shouldOptimize }) => {
      try {
        // Create or reuse latest session
        const session = await sessionStore.create(label);
        const sessionDir = sessionStore.getSessionDir(session.id);
        const screenshotsDir = join(sessionDir, 'screenshots');

        // Determine sequential filename
        const existing = await readdir(screenshotsDir).catch(() => []);
        const index = existing.filter((f) => f.startsWith('screenshot-')).length + 1;
        const filename = `screenshot-${String(index).padStart(3, '0')}.png`;
        const outputPath = join(screenshotsDir, filename);
        const context = await captureContextSnapshot();

        log(`Capturing screenshot: display=${display}, label=${label ?? 'none'}`);

        // Capture
        await capture({ display, outputPath });

        // Optimize if requested
        if (shouldOptimize) {
          await optimize(outputPath);
        }

        const latestMetadata = await sessionStore.get(session.id);
        const existingCaptures = latestMetadata?.captures ?? [];
        await sessionStore.update(session.id, {
          lastCaptureContext: context,
          captures: [
            ...existingCaptures,
            {
              file: filename,
              label,
              display,
              capturedAt: context.recordedAt,
              context,
            },
          ].slice(-250),
        });

        const markdownRef = `![${label ?? filename}](screenshots/${filename})`;
        const contextSummary = [
          context.cursor ? `Cursor: ${Math.round(context.cursor.x)}, ${Math.round(context.cursor.y)}` : '',
          context.activeWindow?.appName ? `App: ${context.activeWindow.appName}` : '',
          context.focusedElement?.textPreview ? `Focus: ${context.focusedElement.textPreview}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot saved: ${outputPath}\n${markdownRef}${
                contextSummary ? `\nContext: ${contextSummary}` : ''
              }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
