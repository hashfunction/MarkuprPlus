/**
 * Tool: analyze_video
 *
 * Process an existing video file through the MarkuprX pipeline.
 * Generates a structured markdown report with transcript, key moments,
 * and extracted frames.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { stat } from 'fs/promises';
import { sessionStore } from '../session/SessionStore.js';
import { log } from '../utils/Logger.js';
import { CLIPipeline } from '../../cli/CLIPipeline.js';
import { templateRegistry } from '../../main/output/templates/index.js';

export function register(server: McpServer): void {
  server.tool(
    'analyze_video',
    'Returns a structured report path plus transcript, extracted-frame, and processing counts for an existing video file.',
    {
      videoPath: z.string().describe('Absolute path to the video file'),
      audioPath: z.string().optional().describe('Separate audio file path (if not embedded)'),
      outputDir: z.string().optional().describe('Output directory (default: session directory)'),
      skipFrames: z.boolean().optional().default(false).describe('Skip frame extraction'),
      template: z.string().optional().describe(
        `Output template (default: markdown). Options: ${templateRegistry.list().join(', ')}`
      ),
    },
    async ({ videoPath, audioPath, outputDir, skipFrames, template }) => {
      try {
        // Validate video file exists and is non-empty
        let fileStats;
        try {
          fileStats = await stat(videoPath);
        } catch {
          return {
            content: [{ type: 'text', text: `Error: Video file not found: ${videoPath}` }],
            isError: true,
          };
        }

        if (!fileStats.isFile() || fileStats.size === 0) {
          return {
            content: [{ type: 'text', text: `Error: Video file is empty or not a regular file: ${videoPath}` }],
            isError: true,
          };
        }

        // Validate audio file if provided
        if (audioPath) {
          try {
            const audioStats = await stat(audioPath);
            if (!audioStats.isFile() || audioStats.size === 0) {
              return {
                content: [{ type: 'text', text: `Error: Audio file is empty or not a regular file: ${audioPath}` }],
                isError: true,
              };
            }
          } catch {
            return {
              content: [{ type: 'text', text: `Error: Audio file not found: ${audioPath}` }],
              isError: true,
            };
          }
        }

        // Create session for tracking
        const session = await sessionStore.create();
        const sessionDir = sessionStore.getSessionDir(session.id);
        const pipelineOutputDir = outputDir ?? sessionDir;

        log(`Analyzing video: ${videoPath}`);

        const pipeline = new CLIPipeline(
          {
            videoPath,
            audioPath,
            outputDir: pipelineOutputDir,
            skipFrames,
            template,
            verbose: false,
          },
          (msg) => log(msg),
        );

        const result = await pipeline.run();

        // Update session
        await sessionStore.update(session.id, {
          status: 'complete',
          endTime: Date.now(),
          videoPath,
          reportPath: result.outputPath,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `Video analysis complete`,
                'Pipeline results:',
                `  Transcript segments: ${result.transcriptSegments}`,
                `  Extracted frames: ${result.extractedFrames}`,
                `  Processing time: ${result.durationSeconds.toFixed(1)}s`,
                '',
                `Report: ${result.outputPath}`,
                `OUTPUT:${result.outputPath}`,
              ].join('\n'),
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
