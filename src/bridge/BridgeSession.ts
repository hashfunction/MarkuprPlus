import type { Session, Screenshot } from '../main/SessionController';
import type { MarkedIssuePayload, SessionMetadata } from '../shared/types';
import {
  parseBridgeSessionPayload,
  type BridgeSessionPayload,
} from '../shared/cliBridgeProtocol';

function screenshotMimeType(buffer: Buffer): 'image/png' | 'image/jpeg' {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return 'image/png';
}

function sanitizeMarkedIssues(
  issues: MarkedIssuePayload[] | undefined,
): BridgeSessionPayload['metadata']['markedIssues'] {
  return issues?.map(({ screenshotPath: _screenshotPath, ...issue }) => structuredClone(issue));
}

function sanitizeMetadata(metadata: SessionMetadata): BridgeSessionPayload['metadata'] {
  const portable = structuredClone(metadata);
  const { markedIssues } = portable;
  delete portable.recordingPath;
  delete portable.audioPath;
  delete portable.markedIssues;
  return {
    ...portable,
    ...(markedIssues ? { markedIssues: sanitizeMarkedIssues(markedIssues) } : {}),
  };
}

export function serializeBridgeSession(session: Session): BridgeSessionPayload {
  return parseBridgeSessionPayload({
    id: session.id,
    startTime: session.startTime,
    ...(session.endTime === undefined ? {} : { endTime: session.endTime }),
    state: session.state,
    sourceId: session.sourceId,
    feedbackItems: session.feedbackItems.map(({ id, timestamp, text, confidence }) => ({
      id,
      timestamp,
      text,
      confidence,
    })),
    transcriptBuffer: structuredClone(session.transcriptBuffer),
    screenshots: session.screenshotBuffer.map((screenshot) => ({
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      width: screenshot.width,
      height: screenshot.height,
      mimeType: screenshotMimeType(screenshot.buffer),
      dataBase64: screenshot.buffer.toString('base64'),
    })),
    metadata: sanitizeMetadata(session.metadata),
  });
}

export function deserializeBridgeSession(value: BridgeSessionPayload): Session {
  const payload = parseBridgeSessionPayload(value);
  const screenshotBuffer: Screenshot[] = payload.screenshots.map((screenshot) => ({
    id: screenshot.id,
    timestamp: screenshot.timestamp,
    width: screenshot.width,
    height: screenshot.height,
    buffer: Buffer.from(screenshot.dataBase64, 'base64'),
  }));
  return {
    id: payload.id,
    startTime: payload.startTime,
    ...(payload.endTime === undefined ? {} : { endTime: payload.endTime }),
    state: payload.state,
    sourceId: payload.sourceId,
    feedbackItems: structuredClone(payload.feedbackItems),
    transcriptBuffer: structuredClone(payload.transcriptBuffer),
    screenshotBuffer,
    metadata: structuredClone(payload.metadata) as SessionMetadata,
  };
}
