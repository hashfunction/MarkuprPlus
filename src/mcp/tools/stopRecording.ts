/**
 * Tool: stop_recording
 *
 * Stop an active recording and run the full MarkuprX pipeline on the
 * captured video. Returns the report path and summary stats.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { stop } from '../capture/ScreenRecorder.js';
import { activeRecording } from '../session/ActiveRecording.js';
import { sessionStore } from '../session/SessionStore.js';
import { log } from '../utils/Logger.js';
import { CLIPipeline } from '../../cli/CLIPipeline.js';
import { templateRegistry } from '../../main/output/templates/index.js';
import { captureContextSnapshot } from '../utils/CaptureContext.js';
import type { CaptureContextSnapshot } from '../../shared/types.js';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand.js';

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
    'stop_recording',
    `Stop an active recording and run the full ${PUBLIC_BRAND_NAME} pipeline on the captured video.`,
    {
      sessionId: z.string().optional().describe('Session ID (default: current active recording)'),
      skipFrames: z.boolean().optional().default(false).describe('Skip frame extraction'),
      template: z.string().optional().describe(
        `Output template (default: markdown). Options: ${templateRegistry.list().join(', ')}`
      ),
    },
    async ({ sessionId: _requestedSessionId, skipFrames, template }) => {
      try {
        // Verify there's an active recording
        if (!activeRecording.isRecording()) {
          return {
            content: [{ type: 'text', text: 'Error: No recording in progress.' }],
            isError: true,
          };
        }

        const current = activeRecording.getCurrent();
        if (!current) {
          return {
            content: [{ type: 'text', text: 'Error: No recording in progress.' }],
            isError: true,
          };
        }

        log(`Stopping recording: session=${current.sessionId}`);

        // Stop the ffmpeg process gracefully
        await stop(current.process);

        // Release the lock and get recording info
        const { sessionId, videoPath } = activeRecording.stop();
        const stopContext = await captureContextSnapshot();

        // Update session status to processing
        await sessionStore.update(sessionId, { status: 'processing' });

        const metadataBeforePipeline = await sessionStore.get(sessionId);
        const captureContexts: CaptureContextSnapshot[] = [
          toSharedCaptureContext(metadataBeforePipeline?.recordingContextStart),
          ...(metadataBeforePipeline?.captures || []).map((capture) => toSharedCaptureContext(capture.context)),
          toSharedCaptureContext(stopContext),
        ].filter((context): context is CaptureContextSnapshot => Boolean(context));

        // Run pipeline
        const sessionDir = sessionStore.getSessionDir(sessionId);
        const pipeline = new CLIPipeline(
          {
            videoPath,
            outputDir: sessionDir,
            skipFrames,
            template,
            verbose: false,
            captureContexts,
          },
          (msg) => log(msg),
        );

        const result = await pipeline.run();

        // Update session with results
        await sessionStore.update(sessionId, {
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
                `Recording stopped and processed.`,
                `Session: ${sessionId}`,
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
