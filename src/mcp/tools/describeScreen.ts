/**
 * Tool: describe_screen
 *
 * Captures a screenshot (or reads a provided image path) and uses Claude's
 * vision API to produce a structured text description of what is visible on
 * screen. Designed to give AI coding agents rich visual context: UI elements,
 * text content, layout structure, active windows, error messages, etc.
 *
 * Works in headless mode -- no Electron dependency.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'path';
import { readFile, unlink, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { capture } from '../capture/ScreenCapture.js';
import { optimize } from '../utils/ImageOptimizer.js';
import { log } from '../utils/Logger.js';

// ---------------------------------------------------------------------------
// System prompt -- instructs Claude to produce a structured screen description
// ---------------------------------------------------------------------------

const DESCRIBE_SCREEN_PROMPT = `You are a screen description engine for AI coding agents. You receive a screenshot of a developer's screen and must describe what is visible in a structured, actionable way.

## Output Structure

Return a structured description with the following sections:

### Active Window
Identify the primary/focused application and its state (e.g., "VS Code with main.ts open", "Chrome showing localhost:3000").

### Visible UI Elements
List the key UI elements visible: buttons, inputs, navigation, modals, dialogs, sidebars, tabs, toolbars, etc. Be specific about labels and state (enabled/disabled, selected, etc.).

### Text Content
Extract any readable text: error messages, code snippets, terminal output, form content, headings, notifications, toasts, etc. Quote verbatim when possible.

### Layout Structure
Briefly describe the spatial layout: panels, split views, columns, overlays, etc.

### Notable Issues
Flag anything that looks like a problem: error dialogs, red indicators, broken layouts, console errors, failed builds, stack traces, etc. If nothing looks wrong, say "None observed."

## Rules
1. Be factual and precise. Describe what you SEE, do not speculate about intent.
2. Use developer-friendly terminology (e.g., "modal dialog" not "popup box").
3. If text is partially obscured, note what is readable and indicate truncation with [...].
4. Keep the description concise but thorough. Every line should be useful to an AI agent trying to understand the screen context.
5. Do not wrap your response in markdown code fences. Return plain structured text.`;

// ---------------------------------------------------------------------------
// Tool Registration
// ---------------------------------------------------------------------------

export function register(server: McpServer): void {
  server.tool(
    'describe_screen',
    'Capture a screenshot (or read an existing image) and return a structured text description of what is visible on screen. Useful for giving AI agents visual context about UI state, errors, layout, and text content.',
    {
      imagePath: z
        .string()
        .optional()
        .describe(
          'Absolute path to an existing screenshot/image file. If omitted, a fresh screenshot is captured.',
        ),
      display: z
        .number()
        .optional()
        .default(1)
        .describe('Display number to capture (1-indexed). Ignored when imagePath is provided.'),
      apiKey: z
        .string()
        .optional()
        .describe(
          'Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.',
        ),
      focus: z
        .string()
        .optional()
        .describe(
          'Optional focus area to pay extra attention to (e.g., "the error dialog", "the terminal output", "the sidebar navigation").',
        ),
    },
    async ({ imagePath, display, apiKey, focus }) => {
      // Resolve API key
      const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!resolvedKey) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: No Anthropic API key provided. Pass via `apiKey` parameter or set ANTHROPIC_API_KEY env var.',
            },
          ],
          isError: true,
        };
      }

      let screenshotPath: string | undefined;
      let tempPath: string | undefined;

      try {
        // -----------------------------------------------------------------
        // Step 1: Obtain the screenshot
        // -----------------------------------------------------------------
        if (imagePath) {
          // Validate provided image path
          let fileStats;
          try {
            fileStats = await stat(imagePath);
          } catch {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: Image file not found: ${imagePath}`,
                },
              ],
              isError: true,
            };
          }

          if (!fileStats.isFile() || fileStats.size === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: Image file is empty or not a regular file: ${imagePath}`,
                },
              ],
              isError: true,
            };
          }

          screenshotPath = imagePath;
        } else {
          // Capture fresh screenshot
          tempPath = join(
            tmpdir(),
            `markuprx-mcp-describe-${randomUUID()}.png`,
          );
          log(`Capturing screenshot for describe_screen: display=${display}`);
          await capture({ display, outputPath: tempPath });
          await optimize(tempPath);
          screenshotPath = tempPath;
        }

        // -----------------------------------------------------------------
        // Step 2: Read image as base64
        // -----------------------------------------------------------------
        const imageBuffer = await readFile(screenshotPath!);
        const base64Data = imageBuffer.toString('base64');

        // Determine media type from extension
        const ext = screenshotPath!.split('.').pop()?.toLowerCase();
        const mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' =
          ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : 'image/png';

        // -----------------------------------------------------------------
        // Step 3: Call Claude vision API
        // -----------------------------------------------------------------
        log('Calling Claude API for screen description');

        const client = new Anthropic({ apiKey: resolvedKey });

        const userPrompt = focus
          ? `Describe what is visible on this screen. Pay special attention to: ${focus}`
          : 'Describe what is visible on this screen.';

        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 2048,
          temperature: 0.2,
          system: DESCRIBE_SCREEN_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
                {
                  type: 'text',
                  text: userPrompt,
                },
              ],
            },
          ],
        });

        // Extract text from response
        const textBlock = response.content.find(
          (block) => block.type === 'text',
        );
        if (!textBlock || textBlock.type !== 'text') {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: No text content in Claude response.',
              },
            ],
            isError: true,
          };
        }

        const timestamp = new Date().toISOString();
        const source = imagePath
          ? `image file: ${imagePath}`
          : `display ${display} capture`;

        log('Screen description complete');

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `# Screen Description`,
                `_Source: ${source} | ${timestamp}_`,
                '',
                textBlock.text,
              ].join('\n'),
            },
          ],
        };
      } catch (error) {
        const message = (error as Error).message;

        // Provide actionable error messages for common failures
        if (message.includes('401') || message.includes('authentication')) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Anthropic API authentication failed. Check your API key.',
              },
            ],
            isError: true,
          };
        }

        if (message.includes('429') || message.includes('rate')) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Anthropic API rate limit exceeded. Try again shortly.',
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${message}`,
            },
          ],
          isError: true,
        };
      } finally {
        // Clean up temp file if we created one
        if (tempPath) {
          await unlink(tempPath).catch(() => {});
        }
      }
    },
  );
}
