import { describe, expect, it, vi } from 'vitest';

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: vi.fn(),
}));
vi.mock('../../../src/cli/CLIPipeline.js', () => ({ CLIPipeline: vi.fn() }));
vi.mock('../../../src/mcp/capture/ScreenCapture.js', () => ({ capture: vi.fn() }));
vi.mock('../../../src/mcp/capture/ScreenRecorder.js', () => ({
  record: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../../src/mcp/session/SessionStore.js', () => ({ sessionStore: {} }));
vi.mock('../../../src/mcp/session/ActiveRecording.js', () => ({ activeRecording: {} }));
vi.mock('../../../src/mcp/utils/ImageOptimizer.js', () => ({ optimize: vi.fn() }));
vi.mock('../../../src/mcp/utils/Logger.js', () => ({ log: vi.fn() }));
vi.mock('../../../src/mcp/utils/CaptureContext.js', () => ({
  captureContextSnapshot: vi.fn(),
}));
vi.mock('../../../src/main/output/templates/index.js', () => ({
  templateRegistry: { list: () => ['markdown'] },
}));
vi.mock('../../../src/integrations/github/GitHubIssueCreator.js', () => ({
  resolveAuth: vi.fn(),
  parseRepoString: vi.fn(),
  pushToGitHub: vi.fn(),
}));
vi.mock('../../../src/integrations/linear/LinearIssueCreator.js', () => ({
  LinearIssueCreator: vi.fn(),
}));

import { register as registerAnalyzeScreenshot } from '../../../src/mcp/tools/analyzeScreenshot.js';
import { register as registerAnalyzeVideo } from '../../../src/mcp/tools/analyzeVideo.js';
import { register as registerCaptureScreenshot } from '../../../src/mcp/tools/captureScreenshot.js';
import { register as registerCaptureWithVoice } from '../../../src/mcp/tools/captureWithVoice.js';
import { register as registerDescribeScreen } from '../../../src/mcp/tools/describeScreen.js';
import { register as registerPushToGitHub } from '../../../src/mcp/tools/pushToGitHub.js';
import { register as registerPushToLinear } from '../../../src/mcp/tools/pushToLinear.js';
import { register as registerStartRecording } from '../../../src/mcp/tools/startRecording.js';
import { register as registerStopRecording } from '../../../src/mcp/tools/stopRecording.js';

const EXPECTED_DESCRIPTIONS = {
  capture_screenshot:
    'Returns a saved PNG path, markdown image reference, and captured cursor/window context for the current screen.',
  capture_with_voice:
    'Returns a structured report path plus transcript, extracted-frame, and processing counts from a timed screen-and-voice capture.',
  describe_screen:
    'Returns a structured visual description of a fresh screen capture or supplied image, including UI, text, layout, and notable issues.',
  start_recording:
    'Returns a session ID and recording status for a new long-form screen-and-voice session.',
  stop_recording:
    'Returns the completed report path plus transcript, frame, and processing counts for the active recording session.',
  analyze_video:
    'Returns a structured report path plus transcript, extracted-frame, and processing counts for an existing video file.',
  analyze_screenshot:
    'Returns the captured screen as image data with its MIME type so a vision-capable agent can inspect it directly.',
  push_to_github:
    'Returns created GitHub issue URLs and numbers, or a dry-run preview, with one issue per report finding.',
  push_to_linear:
    'Returns created Linear issue identifiers and URLs, or a dry-run preview, with one issue per report finding.',
} as const;

describe('MCP tool selection descriptions', () => {
  it('describes all nine tools by the artifacts returned to the calling agent', () => {
    const registrations: Record<string, string> = {};
    const server = {
      tool(name: string, description: string) {
        registrations[name] = description;
      },
    } as never;

    registerCaptureScreenshot(server);
    registerCaptureWithVoice(server);
    registerDescribeScreen(server);
    registerStartRecording(server);
    registerStopRecording(server);
    registerAnalyzeVideo(server);
    registerAnalyzeScreenshot(server);
    registerPushToGitHub(server);
    registerPushToLinear(server);

    expect(registrations).toEqual(EXPECTED_DESCRIPTIONS);
  });
});
