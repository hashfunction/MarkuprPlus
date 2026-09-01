/**
 * Tool: analyze_screenshot
 *
 * Takes a screenshot and returns it as ImageContent for the AI to analyze
 * visually. Unlike capture_screenshot, this returns the image data directly
 * as base64 for vision analysis rather than just saving to disk.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { capture } from '../capture/ScreenCapture.js';
import { optimize } from '../utils/ImageOptimizer.js';
import { log } from '../utils/Logger.js';

export function register(server: McpServer): void {
  server.tool(
    'analyze_screenshot',
    'Returns the captured screen as image data with its MIME type so a vision-capable agent can inspect it directly.',
    {
      display: z.number().optional().default(1).describe('Display number (1-indexed)'),
      question: z.string().optional().describe('What to look for in the screenshot'),
    },
    async ({ display, question }) => {
      const tempPath = join(tmpdir(), `markuprx-mcp-screenshot-${randomUUID()}.png`);

      try {
        log(`Capturing screenshot for analysis: display=${display}`);

        // Capture screenshot to temp file
        await capture({ display, outputPath: tempPath });

        // Optimize for API efficiency
        await optimize(tempPath);

        // Read as base64
        const imageBuffer = await readFile(tempPath);
        const base64Data = imageBuffer.toString('base64');

        const timestamp = new Date().toISOString();
        const description = question
          ? `Screenshot of display ${display} captured at ${timestamp}. Question: ${question}`
          : `Screenshot of display ${display} captured at ${timestamp}`;

        return {
          content: [
            {
              type: 'image' as const,
              data: base64Data,
              mimeType: 'image/png',
            },
            {
              type: 'text' as const,
              text: description,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      } finally {
        // Clean up temp file
        await unlink(tempPath).catch(() => {});
      }
    },
  );
}
