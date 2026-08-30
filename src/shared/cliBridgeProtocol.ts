import { z } from 'zod';
import type { AnalysisModelOption, AnalysisProviderStatus } from './types';
import type { AIAnalysisResult } from '../main/ai/types';

export const CLI_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const CLI_BRIDGE_DEFAULT_HOST = '127.0.0.1' as const;
export const CLI_BRIDGE_DEFAULT_PORT = 49_647 as const;
export const CLI_BRIDGE_MAX_BODY_BYTES = 32 * 1024 * 1024;
export const CLI_BRIDGE_MAX_SCREENSHOTS = 20;
export const CLI_BRIDGE_MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const CLI_BRIDGE_MAX_SESSION_ITEMS = 2_000;

export const CLI_BRIDGE_PROVIDER_IDS = [
  'codex-cli',
  'claude-cli',
  'opencode-cli',
  'cursor-cli',
  'qwen-cli',
  'goose-cli',
  'amp-cli',
  'kiro-cli',
  'aider-cli',
] as const;

export type CliBridgeProvider = typeof CLI_BRIDGE_PROVIDER_IDS[number];

export type CliBridgeErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNSUPPORTED'
  | 'BRIDGE_BUSY'
  | 'PROVIDER_UNAVAILABLE'
  | 'ANALYSIS_TIMEOUT'
  | 'ANALYSIS_FAILED'
  | 'INTERNAL_ERROR'
  | 'BRIDGE_PROTOCOL_ERROR';

export interface BridgeErrorEnvelope {
  error: {
    code: CliBridgeErrorCode;
    message: string;
  };
}

export interface BridgeHealthResponse {
  bridgeVersion: string;
  protocolVersion: number;
  pairingConfigured: boolean;
}

export interface BridgeProvidersResponse {
  protocolVersion: number;
  providers: AnalysisProviderStatus[];
}

export interface BridgeModelsResponse {
  protocolVersion: number;
  models: AnalysisModelOption[];
}

export interface BridgeAnalysisResponse {
  protocolVersion: number;
  analysis: AIAnalysisResult;
}

const boundedString = (max = 4_096) => z.string().max(max);
const finiteNumber = z.number();
const nonnegativeInteger = z.number().int().nonnegative();
const sessionStateSchema = z.enum([
  'idle', 'starting', 'recording', 'stopping', 'processing', 'complete', 'error',
]);
const providerSchema = z.enum(CLI_BRIDGE_PROVIDER_IDS);

const boundsSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber,
  height: finiteNumber,
}).strict();

const captureTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('window'),
    sourceId: boundedString(),
    sourceName: boundedString(),
    nativeWindowId: boundedString(),
    appName: boundedString(),
    bounds: boundsSchema,
    geometryAvailable: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal('region'),
    sourceId: boundedString(),
    sourceName: boundedString(),
    displayId: boundedString(),
    displayBounds: boundsSchema,
    scaleFactor: finiteNumber,
    region: boundsSchema,
  }).strict(),
  z.object({
    kind: z.literal('screen'),
    sourceId: boundedString(),
    sourceName: boundedString(),
    displayId: boundedString(),
    displayBounds: boundsSchema,
    scaleFactor: finiteNumber,
  }).strict(),
]);

const focusedElementSchema = z.object({
  source: z.enum(['renderer-dom', 'os-accessibility', 'window-title', 'unknown']),
  role: boundedString().optional(),
  tagName: boundedString().optional(),
  id: boundedString().optional(),
  name: boundedString().optional(),
  label: boundedString().optional(),
  placeholder: boundedString().optional(),
  textPreview: boundedString().optional(),
  appName: boundedString().optional(),
  windowTitle: boundedString().optional(),
}).strict();

const captureContextSchema = z.object({
  recordedAt: finiteNumber,
  trigger: z.enum(['pause', 'manual', 'voice-command', 'annotation']),
  cursor: z.object({
    x: finiteNumber,
    y: finiteNumber,
    displayId: boundedString().optional(),
    displayLabel: boundedString().optional(),
    relativeX: finiteNumber.optional(),
    relativeY: finiteNumber.optional(),
  }).strict().optional(),
  activeWindow: z.object({
    sourceId: boundedString().optional(),
    sourceName: boundedString().optional(),
    sourceType: z.enum(['screen', 'window', 'region']).optional(),
    appName: boundedString().optional(),
    title: boundedString().optional(),
    pid: nonnegativeInteger.optional(),
  }).strict().optional(),
  focusedElement: focusedElementSchema.optional(),
  annotation: z.object({
    strokeId: boundedString(),
    tool: z.enum(['freehand', 'circle', 'highlight']),
    color: z.enum(['#ff3b30', '#ffcc00', '#34c759', '#0a84ff']),
  }).strict().optional(),
}).strict();

const markedIssueSchema = z.object({
  id: boundedString(),
  ordinal: nonnegativeInteger,
  startedAt: finiteNumber,
  markedAt: finiteNumber,
  completedAt: finiteNumber,
  strokeIds: z.array(boundedString()).max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  tools: z.array(z.enum(['freehand', 'circle', 'highlight'])).max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  colors: z.array(z.enum(['#ff3b30', '#ffcc00', '#34c759', '#0a84ff']))
    .max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  fallbackVideoTimestamp: finiteNumber,
  captureContext: captureContextSchema.optional(),
  comment: boundedString(1024 * 1024).optional(),
  transcriptionStatus: z.enum(['pending', 'available', 'unavailable']),
  transcriptionWarning: boundedString().optional(),
  snapshotRevision: nonnegativeInteger,
  transcriptSegmentIds: z.array(boundedString()).max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  evidenceWarning: boundedString().optional(),
}).strict();

const metadataSchema = z.object({
  sourceId: boundedString(),
  sourceName: boundedString().optional(),
  sourceType: z.enum(['screen', 'window', 'region']).optional(),
  captureTarget: captureTargetSchema.optional(),
  windowTitle: boundedString().optional(),
  appName: boundedString().optional(),
  recordingMimeType: boundedString(256).optional(),
  recordingBytes: nonnegativeInteger.optional(),
  audioBytes: nonnegativeInteger.optional(),
  audioDurationMs: finiteNumber.nonnegative().optional(),
  videoStartTime: finiteNumber.optional(),
  captureContexts: z.array(captureContextSchema).max(CLI_BRIDGE_MAX_SESSION_ITEMS).optional(),
  markedIssues: z.array(markedIssueSchema).max(CLI_BRIDGE_MAX_SESSION_ITEMS).optional(),
  transcriptionFailure: z.object({
    code: z.enum([
      'audio-unavailable', 'not-configured', 'openai-failed', 'whisper-failed', 'no-speech',
    ]),
    message: boundedString(),
  }).strict().optional(),
}).strict();

const feedbackItemSchema = z.object({
  id: boundedString(),
  timestamp: finiteNumber,
  text: boundedString(1024 * 1024),
  confidence: finiteNumber,
}).strict();

const transcriptEventSchema = z.object({
  text: boundedString(1024 * 1024),
  isFinal: z.boolean(),
  confidence: finiteNumber,
  timestamp: finiteNumber,
  tier: z.enum(['whisper', 'timer-only']),
}).strict();

function decodedBase64ByteLength(value: string): number | null {
  if (value.length === 0 || value.length % 4 !== 0) return null;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  for (let index = 0; index < value.length - padding; index += 1) {
    const code = value.charCodeAt(index);
    const valid =
      (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || (code >= 0x30 && code <= 0x39)
      || code === 0x2b
      || code === 0x2f;
    if (!valid) return null;
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value[index] !== '=') return null;
  }
  return (value.length / 4) * 3 - padding;
}

const screenshotSchema = z.object({
  id: boundedString(),
  timestamp: finiteNumber,
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  dataBase64: z.string().superRefine((value, context) => {
    const decodedBytes = decodedBase64ByteLength(value);
    if (decodedBytes === null || decodedBytes > CLI_BRIDGE_MAX_SCREENSHOT_BYTES) {
      context.addIssue({
        code: 'custom',
        message: 'Screenshot data must be valid base64 within the decoded byte limit.',
      });
    }
  }),
}).strict();

export const bridgeSessionSchema = z.object({
  id: boundedString(),
  startTime: finiteNumber,
  endTime: finiteNumber.optional(),
  state: sessionStateSchema,
  sourceId: boundedString(),
  feedbackItems: z.array(feedbackItemSchema).max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  transcriptBuffer: z.array(transcriptEventSchema).max(CLI_BRIDGE_MAX_SESSION_ITEMS),
  screenshots: z.array(screenshotSchema).max(CLI_BRIDGE_MAX_SCREENSHOTS),
  metadata: metadataSchema,
}).strict();

export type BridgeSessionPayload = z.infer<typeof bridgeSessionSchema>;

const bridgeAnalyzeRequestSchema = z.object({
  protocolVersion: z.literal(CLI_BRIDGE_PROTOCOL_VERSION),
  provider: providerSchema,
  modelId: z.string()
    .min(1)
    .max(200)
    .refine((value) => !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    }), 'Model ID cannot contain control characters.')
    .optional(),
  session: bridgeSessionSchema,
}).strict();

export type BridgeAnalyzeRequest = z.infer<typeof bridgeAnalyzeRequestSchema>;

export function isCliBridgeProvider(value: unknown): value is CliBridgeProvider {
  return typeof value === 'string'
    && (CLI_BRIDGE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function parseBridgeSessionPayload(value: unknown): BridgeSessionPayload {
  const result = bridgeSessionSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Invalid bridge session payload.');
  }
  return result.data;
}

export function parseBridgeAnalyzeRequest(value: unknown): BridgeAnalyzeRequest {
  if (
    value
    && typeof value === 'object'
    && 'provider' in value
    && !isCliBridgeProvider((value as { provider?: unknown }).provider)
  ) {
    throw new Error('Unsupported provider.');
  }
  const result = bridgeAnalyzeRequestSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Invalid bridge request.');
  }
  return result.data;
}
