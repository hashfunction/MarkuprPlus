/**
 * Tool: capture_with_voice
 *
 * Records screen and voice for a specified duration, then runs the full
 * MarkuprX pipeline to produce a structured feedback report.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'path';
import { record } from '../capture/ScreenRecorder.js';
import { sessionStore } from '../session/SessionStore.js';
import { log } from '../utils/Logger.js';
import { CLIPipeline } from '../../cli/CLIPipeline.js';
import { templateRegistry } from '../../main/output/templates/index.js';
import { captureContextSnapshot } from '../utils/CaptureContext.js';
import type { CaptureContextSnapshot } from '../../shared/types.js';

function toSharedCaptureContext(
  context: Awaited<ReturnType<typeof captureContextSnapshot>> | undefined
): CaptureContextSnapshot | undefined {
  if (!context) {
    return undefined;
  }

  return {
    recordedAt: context.recordedAt,
    trigger: 'manual',
    cursor: context.cursor,
    activeWindow: {
      appName: context.activeWindow?.appName,
      title: context.activeWindow?.title,
      pid: context.activeWindow?.pid,
      sourceType: 'screen',
    },
    focusedElement: context.focusedElement
      ? {
          source: context.focusedElement.source,
          role: context.focusedElement.role,
          textPreview: context.focusedElement.textPreview,
          appName: context.focusedElement.appName,
          windowTitle: context.focusedElement.windowTitle,
        }
      : undefined,
  };
}

export function register(server: McpServer): void {
  server.tool(
    'capture_with_voice',
    'Returns a structured report path plus transcript, extracted-frame, and processing counts from a timed screen-and-voice capture.',
    {
      duration: z.number().min(3).max(300).describe('Recording duration in seconds (3-300)'),
      outputDir: z.string().optional().describe('Output directory (default: session directory)'),
      skipFrames: z.boolean().optional().default(false).describe('Skip frame extraction'),
      template: z.string().optional().describe(
        `Output template (default: markdown). Options: ${templateRegistry.list().join(', ')}`
      ),
    },
    async ({ duration, outputDir, skipFrames, template }) => {
      try {
        // Create session
        const session = await sessionStore.create();
        const startContext = await captureContextSnapshot();
        await sessionStore.update(session.id, {
          recordingContextStart: startContext,
          lastCaptureContext: startContext,
        });
        const sessionDir = sessionStore.getSessionDir(session.id);
        const videoPath = join(sessionDir, 'recording.mp4');

        log(`Starting capture_with_voice: duration=${duration}s`);

        // Record screen + audio
        await record({ duration, outputPath: videoPath });
        const stopContext = await captureContextSnapshot();
        await sessionStore.update(session.id, {
          recordingContextStop: stopContext,
          lastCaptureContext: stopContext,
        });

        const metadataBeforePipeline = await sessionStore.get(session.id);
        const captureContexts: CaptureContextSnapshot[] = [
          toSharedCaptureContext(metadataBeforePipeline?.recordingContextStart),
          ...(metadataBeforePipeline?.captures || []).map((capture) => toSharedCaptureContext(capture.context)),
          toSharedCaptureContext(stopContext),
        ].filter((context): context is CaptureContextSnapshot => Boolean(context));

        // Run pipeline
        const pipelineOutputDir = outputDir ?? sessionDir;
        const pipeline = new CLIPipeline(
          {
            videoPath,
            outputDir: pipelineOutputDir,
            skipFrames,
            template,
            verbose: false,
            captureContexts,
          },
          (msg) => log(msg),
        );

        const result = await pipeline.run();

        // Update session metadata
        await sessionStore.update(session.id, {
          status: 'complete',
          endTime: Date.now(),
          videoPath,
          reportPath: result.outputPath,
          recordingContextStop: stopContext,
          lastCaptureContext: stopContext,
        });

        return {
          content: [
            {
              type: 'text',
              text: [
                `Recording complete: ${duration} seconds captured`,
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
