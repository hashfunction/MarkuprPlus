/**
 * Tool: start_recording
 *
 * Start a long-form screen+voice recording session. Returns a session ID
 * that can be used with stop_recording.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'path';
import { start } from '../capture/ScreenRecorder.js';
import { activeRecording } from '../session/ActiveRecording.js';
import { sessionStore } from '../session/SessionStore.js';
import { log } from '../utils/Logger.js';
import { captureContextSnapshot } from '../utils/CaptureContext.js';

export function register(server: McpServer): void {
  server.tool(
    'start_recording',
    'Returns a session ID and recording status for a new long-form screen-and-voice session.',
    {
      label: z.string().optional().describe('Session label for organization'),
    },
    async ({ label }) => {
      try {
        // Check if already recording
        if (activeRecording.isRecording()) {
          const current = activeRecording.getCurrent();
          return {
            content: [
              {
                type: 'text',
                text: `Error: Recording already in progress (session: ${current?.sessionId}). Stop it before starting a new one.`,
              },
            ],
            isError: true,
          };
        }

        // Create session
        const session = await sessionStore.create(label);
        const startContext = await captureContextSnapshot();
        await sessionStore.update(session.id, {
          recordingContextStart: startContext,
          lastCaptureContext: startContext,
        });
        const sessionDir = sessionStore.getSessionDir(session.id);
        const videoPath = join(sessionDir, 'recording.mp4');

        log(`Starting long-form recording: session=${session.id}`);

        // Start recording (returns immediately with ffmpeg process handle)
        const process = start({ outputPath: videoPath });

        // Track in active recording lock
        activeRecording.start(session.id, process, videoPath);

        return {
          content: [
            {
              type: 'text',
              text: [
                'Recording started.',
                `Session ID: ${session.id}`,
                'Status: recording',
                'Use stop_recording to end and process the recording.',
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
