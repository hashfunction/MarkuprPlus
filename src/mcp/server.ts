/**
 * MCP Server Factory
 *
 * Creates and configures the MarkuprX MCP server with all tool and resource
 * registrations wired in.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand.js';

// Tool registrations
import { register as registerCaptureScreenshot } from './tools/captureScreenshot.js';
import { register as registerCaptureWithVoice } from './tools/captureWithVoice.js';
import { register as registerAnalyzeVideo } from './tools/analyzeVideo.js';
import { register as registerAnalyzeScreenshot } from './tools/analyzeScreenshot.js';
import { register as registerStartRecording } from './tools/startRecording.js';
import { register as registerStopRecording } from './tools/stopRecording.js';
import { register as registerPushToLinear } from './tools/pushToLinear.js';
import { register as registerPushToGitHub } from './tools/pushToGitHub.js';
import { register as registerDescribeScreen } from './tools/describeScreen.js';

// Resource registrations
import { registerResources } from './resources/sessionResource.js';

// Read version from package.json at build time (injected by esbuild)
declare const __MARKUPRX_VERSION__: string;
const VERSION =
  typeof __MARKUPRX_VERSION__ !== 'undefined' ? __MARKUPRX_VERSION__ : '0.0.0-dev';

export function createServer(): McpServer {
  const server = new McpServer({
    name: PUBLIC_BRAND_NAME,
    version: VERSION,
  });

  // Register all tools
  registerCaptureScreenshot(server);
  registerCaptureWithVoice(server);
  registerAnalyzeVideo(server);
  registerAnalyzeScreenshot(server);
  registerStartRecording(server);
  registerStopRecording(server);
  registerPushToLinear(server);
  registerPushToGitHub(server);
  registerDescribeScreen(server);

  // Register resources (session://latest, session://{id})
  registerResources(server);

  return server;
}
