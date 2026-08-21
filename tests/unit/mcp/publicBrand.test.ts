import { describe, expect, it, vi } from 'vitest';

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()), stat: vi.fn() }));
vi.mock('../../../src/cli/CLIPipeline.js', () => ({ CLIPipeline: vi.fn() }));
vi.mock('../../../src/mcp/capture/ScreenRecorder.js', () => ({
  record: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../../src/mcp/session/SessionStore.js', () => ({
  sessionStore: {},
}));
vi.mock('../../../src/mcp/session/ActiveRecording.js', () => ({
  activeRecording: {},
}));
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

import { register as registerAnalyzeVideo } from '../../../src/mcp/tools/analyzeVideo.js';
import { register as registerCaptureWithVoice } from '../../../src/mcp/tools/captureWithVoice.js';
import { register as registerStopRecording } from '../../../src/mcp/tools/stopRecording.js';
import { register as registerPushToGitHub } from '../../../src/mcp/tools/pushToGitHub.js';
import { register as registerPushToLinear } from '../../../src/mcp/tools/pushToLinear.js';

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, { description?: string }>;
}

function captureRegistrations(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const server = {
    tool(
      name: string,
      description: string,
      schema: Record<string, { description?: string }>,
    ) {
      tools.push({ name, description, schema });
    },
  } as never;

  registerAnalyzeVideo(server);
  registerCaptureWithVoice(server);
  registerStopRecording(server);
  registerPushToGitHub(server);
  registerPushToLinear(server);
  return tools;
}

describe('MCP public branding', () => {
  it('brands public tool descriptions without changing registered tool IDs', () => {
    const tools = captureRegistrations();

    expect(tools.map(({ name }) => name)).toEqual([
      'analyze_video',
      'capture_with_voice',
      'stop_recording',
      'push_to_github',
      'push_to_linear',
    ]);
    for (const tool of tools) {
      expect(tool.description).toContain('MarkuprPlus');
      expect(tool.description).not.toContain('MarkuprX');
    }
  });

  it('brands report-path argument descriptions exposed to MCP clients', () => {
    const tools = captureRegistrations();

    for (const name of ['push_to_github', 'push_to_linear']) {
      const reportPath = tools.find((tool) => tool.name === name)?.schema.reportPath;
      expect(reportPath?.description).toContain('MarkuprPlus markdown report');
      expect(reportPath?.description).not.toContain('MarkuprX');
    }
  });
});
