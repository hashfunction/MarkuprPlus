import {
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import {
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import type {
  MarkedIssuePayload,
  ReviewFeedbackCategory,
  ReviewFeedbackItem,
  ReviewFeedbackSeverity,
  ReviewSession,
  SaveResult,
} from '../../shared/types';
import {
  markdownGenerator,
  type Session as MarkdownSession,
} from './MarkdownGenerator';

const MAX_REVIEW_ITEMS = 200;
const MAX_TRANSCRIPTION_LENGTH = 20_000;
const MAX_SHORT_TEXT_LENGTH = 500;
const PRESERVED_REPORT_HEADINGS = [
  'Session Recording',
  'Session Audio',
  'Saved Audio',
  'Auto-Extracted Screenshots',
  'Transcription Error',
] as const;
const CATEGORIES = new Set<ReviewFeedbackCategory>([
  'Bug',
  'UX Issue',
  'Suggestion',
  'Performance',
  'Question',
  'General',
]);
const SEVERITIES = new Set<ReviewFeedbackSeverity>([
  'Critical',
  'High',
  'Medium',
  'Low',
]);

interface StoredReviewMetadata {
  sessionId: string;
  startTime?: number;
  endTime?: number;
  itemCount?: number;
  screenshotCount?: number;
  markedIssues?: MarkedIssuePayload[];
  reviewFeedbackItems?: ReviewFeedbackItem[];
  source?: { id?: string; name?: string };
  [key: string]: unknown;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid review ${label}.`);
  }
  return value.trim();
}

function finiteTimestamp(value: unknown, label: string): number {
  if (!Number.isFinite(value) || Number(value) < 0) {
    throw new Error(`Invalid review ${label}.`);
  }
  return Number(value);
}

function sanitizeReviewSession(input: ReviewSession): ReviewSession {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid review session.');
  }
  const id = requiredString(input.id, 'session identifier', 128);
  if (!Array.isArray(input.feedbackItems) || input.feedbackItems.length > MAX_REVIEW_ITEMS) {
    throw new Error('Invalid review feedback item count.');
  }

  const feedbackItems = input.feedbackItems.map((item, index): ReviewFeedbackItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid review feedback item ${index + 1}.`);
    }
    const category = item.category && CATEGORIES.has(item.category)
      ? item.category
      : undefined;
    const severity = item.severity && SEVERITIES.has(item.severity)
      ? item.severity
      : undefined;
    const screenshots = Array.isArray(item.screenshots)
      ? item.screenshots.slice(0, 20).map((screenshot, screenshotIndex) => ({
          id: requiredString(
            screenshot.id || `screenshot-${screenshotIndex + 1}`,
            'screenshot identifier',
            128,
          ),
          timestamp: finiteTimestamp(screenshot.timestamp, 'screenshot timestamp'),
          imagePath: typeof screenshot.imagePath === 'string'
            ? screenshot.imagePath.slice(0, 2_048)
            : '',
          width: Number.isFinite(screenshot.width) ? Math.max(0, Number(screenshot.width)) : 0,
          height: Number.isFinite(screenshot.height) ? Math.max(0, Number(screenshot.height)) : 0,
        }))
      : [];

    return {
      id: requiredString(item.id || `item-${index + 1}`, 'feedback identifier', 128),
      transcription: requiredString(
        item.transcription,
        'feedback transcription',
        MAX_TRANSCRIPTION_LENGTH,
      ),
      timestamp: finiteTimestamp(item.timestamp, 'feedback timestamp'),
      screenshots,
      ...(typeof item.title === 'string' && item.title.trim()
        ? { title: item.title.trim().slice(0, MAX_SHORT_TEXT_LENGTH) }
        : {}),
      ...(Array.isArray(item.keywords)
        ? {
            keywords: item.keywords
              .filter((keyword): keyword is string => typeof keyword === 'string')
              .map((keyword) => keyword.trim().slice(0, 100))
              .filter(Boolean)
              .slice(0, 20),
          }
        : {}),
      ...(category ? { category } : {}),
      ...(severity ? { severity } : {}),
      ...(item.reviewItemKind === 'marked-issue'
        ? { reviewItemKind: 'marked-issue' as const }
        : { reviewItemKind: 'feedback' as const }),
      ...(Number.isSafeInteger(item.markedIssueOrdinal)
        && Number(item.markedIssueOrdinal) > 0
        && Number(item.markedIssueOrdinal) <= MAX_REVIEW_ITEMS
        ? { markedIssueOrdinal: Number(item.markedIssueOrdinal) }
        : {}),
    };
  });
  const feedbackIdentifiers = new Set<string>();
  for (const item of feedbackItems) {
    if (feedbackIdentifiers.has(item.id)) {
      throw new Error('Invalid review duplicate feedback identifier.');
    }
    feedbackIdentifiers.add(item.id);
  }

  const startTime = finiteTimestamp(input.startTime, 'start time');
  const endTime = input.endTime === undefined
    ? undefined
    : Math.max(startTime, finiteTimestamp(input.endTime, 'end time'));
  return {
    id,
    startTime,
    ...(endTime === undefined ? {} : { endTime }),
    feedbackItems,
    metadata: {
      ...(typeof input.metadata?.os === 'string'
        ? { os: input.metadata.os.slice(0, 100) }
        : {}),
      ...(typeof input.metadata?.sourceName === 'string'
        ? { sourceName: input.metadata.sourceName.trim().slice(0, 200) }
        : {}),
      ...(input.metadata?.sourceType
        ? { sourceType: input.metadata.sourceType }
        : {}),
      ...(Number.isFinite(input.metadata?.videoStartTime)
        ? { videoStartTime: Number(input.metadata?.videoStartTime) }
        : {}),
    },
  };
}

async function assertContainedSessionDirectory(
  sessionDir: string,
  outputRoot: string,
): Promise<string> {
  const [rootPath, sessionPath] = await Promise.all([
    realpath(resolve(outputRoot)),
    realpath(resolve(sessionDir)),
  ]);
  const childPath = relative(rootPath, sessionPath);
  if (!childPath || childPath.startsWith('..') || isAbsolute(childPath)) {
    throw new Error('The review session is outside the configured output directory.');
  }
  return sessionPath;
}

function extractTopLevelSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function appendPreservedSections(generated: string, previous: string): string {
  const sections = PRESERVED_REPORT_HEADINGS
    .map((heading) => extractTopLevelSection(previous, heading))
    .filter((section): section is string => Boolean(section));
  if (sections.length === 0) return generated.replace(/\n*$/, '\n');
  return `${generated.trimEnd()}\n\n${sections.join('\n\n')}\n`;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.review-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/** Persist Review Editor changes into the existing, identity-matched report. */
export async function updateSavedReviewSession(
  input: ReviewSession,
  sessionDir: string,
  outputRoot: string,
): Promise<SaveResult> {
  const sanitized = sanitizeReviewSession(input);
  const requestedReportPath = join(resolve(sessionDir), 'feedback-report.md');
  const safeSessionDir = await assertContainedSessionDirectory(sessionDir, outputRoot);
  const reportPath = join(safeSessionDir, 'feedback-report.md');
  const summaryPath = join(safeSessionDir, 'feedback-summary.md');
  const metadataPath = join(safeSessionDir, 'metadata.json');
  const [previousReport, metadataText] = await Promise.all([
    readFile(reportPath, 'utf8'),
    readFile(metadataPath, 'utf8'),
  ]);
  const metadata = JSON.parse(metadataText) as StoredReviewMetadata;
  if (metadata.sessionId !== sanitized.id) {
    throw new Error('The review session does not match the saved report.');
  }

  const savedMarkedIssues = new Map(
    (metadata.markedIssues ?? []).map((issue) => [issue.id, issue]),
  );
  const collidingOrdinaryItem = sanitized.feedbackItems.find((item) =>
    item.reviewItemKind !== 'marked-issue' && savedMarkedIssues.has(item.id));
  if (collidingOrdinaryItem) {
    throw new Error('The review feedback identifier collides with saved marked evidence.');
  }
  const unmatchedMarkedItem = sanitized.feedbackItems.find((item) =>
    item.reviewItemKind === 'marked-issue' && !savedMarkedIssues.has(item.id));
  if (unmatchedMarkedItem) {
    throw new Error('The review marked issue does not match saved marked evidence.');
  }
  const mismatchedOrdinalItem = sanitized.feedbackItems.find((item) => {
    if (item.reviewItemKind !== 'marked-issue' || item.markedIssueOrdinal === undefined) {
      return false;
    }
    return savedMarkedIssues.get(item.id)?.ordinal !== item.markedIssueOrdinal;
  });
  if (mismatchedOrdinalItem) {
    throw new Error('The review marked issue ordinal does not match saved marked evidence.');
  }

  const markedReviewItems = new Map(
    sanitized.feedbackItems
      .filter((item) => item.reviewItemKind === 'marked-issue')
      .map((item) => [item.id, item]),
  );
  const markedIssues = structuredClone(metadata.markedIssues ?? []).map((issue) => {
    const reviewed = markedReviewItems.get(issue.id);
    if (!reviewed) return issue;
    return {
      ...issue,
      comment: reviewed.transcription,
      transcriptionStatus: 'available' as const,
      transcriptionWarning: undefined,
    };
  });
  const ordinaryFeedbackItems = sanitized.feedbackItems
    .filter((item) => !markedReviewItems.has(item.id));
  const markdownSession: MarkdownSession = {
    ...sanitized,
    feedbackItems: ordinaryFeedbackItems,
    metadata: {
      ...sanitized.metadata,
      markedIssues,
    },
  };
  const generated = markdownGenerator.generateFullDocument(markdownSession, {
    projectName: sanitized.metadata?.sourceName
      || metadata.source?.name
      || 'Feedback Session',
    screenshotDir: './screenshots',
  });
  const report = appendPreservedSections(generated.content, previousReport);
  const markedScreenshotCount = markedIssues
    .filter((issue) => Boolean(issue.screenshotPath)).length;
  const reviewScreenshotCount = ordinaryFeedbackItems
    .reduce((total, item) => total + item.screenshots.length, 0);
  const screenshotCount = Math.max(
    0,
    Number.isFinite(metadata.screenshotCount) ? Number(metadata.screenshotCount) : 0,
    markedScreenshotCount + reviewScreenshotCount,
  );
  const itemCount = ordinaryFeedbackItems.length + markedIssues.length;
  const nextMetadata: StoredReviewMetadata = {
    ...metadata,
    startTime: sanitized.startTime,
    endTime: sanitized.endTime,
    itemCount,
    screenshotCount,
    markedIssues,
    reviewFeedbackItems: sanitized.feedbackItems,
    reviewedAt: new Date().toISOString(),
  };
  const summary = [
    '# Quick Summary',
    '',
    `**Items:** ${itemCount}`,
    `**Screenshots:** ${screenshotCount}`,
    `**Duration:** ${sanitized.endTime
      ? Math.max(0, Math.round((sanitized.endTime - sanitized.startTime) / 1_000))
      : 0}s`,
    '',
    '## Feedback Points',
    '',
    ...ordinaryFeedbackItems.map((item, index) =>
      `${index + 1}. ${item.transcription.slice(0, 100)}${item.transcription.length > 100 ? '...' : ''}`),
    ...markedIssues.map((issue) =>
      `${ordinaryFeedbackItems.length + issue.ordinal}. ${issue.comment
        || issue.transcriptionWarning
        || `Marked issue MX-${String(issue.ordinal).padStart(3, '0')}`}`),
    '',
  ].join('\n');

  await Promise.all([
    atomicWrite(reportPath, report),
    atomicWrite(summaryPath, summary),
    atomicWrite(metadataPath, `${JSON.stringify(nextMetadata, null, 2)}\n`),
  ]);
  return { success: true, path: requestedReportPath };
}
