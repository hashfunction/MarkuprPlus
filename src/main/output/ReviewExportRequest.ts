import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  realpath,
  stat,
} from 'node:fs/promises';
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import type {
  ReviewExportFormat,
  ReviewExportOptions,
  ReviewExportTheme,
  ReviewSession,
} from '../../shared/types';
import { sanitizeReviewSession } from './SavedReviewUpdater';

export type SanitizedReviewExportOptions = ReviewExportOptions;

const EXPORT_FORMATS = new Set<ReviewExportFormat>(['markdown', 'pdf', 'html', 'json']);
const EXPORT_THEMES = new Set<ReviewExportTheme>(['dark', 'light']);
const MAX_PROJECT_NAME_LENGTH = 120;

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  }).join('');
}

export function sanitizeReviewExportOptions(input: unknown): SanitizedReviewExportOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid export options.');
  }
  const candidate = input as Partial<SanitizedReviewExportOptions>;
  if (typeof candidate.format !== 'string'
    || !EXPORT_FORMATS.has(candidate.format as ReviewExportFormat)) {
    throw new Error('Invalid export format.');
  }
  if (typeof candidate.projectName !== 'string') {
    throw new Error('Invalid export project name.');
  }
  const projectName = replaceControlCharacters(candidate.projectName)
    .replace(/\s+/g, ' ')
    .trim();
  if (!projectName || projectName.length > MAX_PROJECT_NAME_LENGTH) {
    throw new Error('Invalid export project name.');
  }
  if (typeof candidate.includeImages !== 'boolean') {
    throw new Error('Invalid export image option.');
  }
  if (typeof candidate.theme !== 'string'
    || !EXPORT_THEMES.has(candidate.theme as ReviewExportTheme)) {
    throw new Error('Invalid export theme.');
  }

  return {
    format: candidate.format as ReviewExportFormat,
    projectName,
    includeImages: candidate.includeImages,
    theme: candidate.theme as ReviewExportTheme,
  };
}

/**
 * Sanitize renderer edits, then hydrate image bytes/paths only from the
 * identity-matched session retained by the main process.
 */
export function trustedReviewExportSession(
  rendererSession: ReviewSession,
  mainOwnedSession: ReviewSession | null,
): ReviewSession {
  const sanitized = sanitizeReviewSession(rendererSession);
  if (sanitized.endTime === undefined) {
    throw new Error('Only a completed review session can be exported.');
  }
  if (sanitized.feedbackItems.length === 0) {
    throw new Error('The completed session has no feedback to export.');
  }

  const trustedItems = mainOwnedSession?.id === sanitized.id
    ? new Map(mainOwnedSession.feedbackItems.map((item) => [item.id, item]))
    : null;

  return {
    ...sanitized,
    feedbackItems: sanitized.feedbackItems.map((item) => {
      const trustedScreenshots = new Map(
        (trustedItems?.get(item.id)?.screenshots ?? []).map((screenshot) => [screenshot.id, screenshot]),
      );
      return {
        ...item,
        screenshots: item.screenshots.map((screenshot) => {
          const trusted = trustedScreenshots.get(screenshot.id);
          return {
            ...screenshot,
            imagePath: trusted?.imagePath ?? '',
            ...(trusted?.base64 ? { base64: trusted.base64 } : {}),
          };
        }),
      };
    }),
  };
}

function exportSlug(projectName: string): string {
  return projectName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'feedback';
}

export function createReviewExportDestination(
  outputRoot: string,
  session: ReviewSession,
  options: SanitizedReviewExportOptions,
  nonce = randomUUID(),
): string {
  const extensions: Record<ReviewExportFormat, string> = {
    markdown: 'md',
    pdf: 'pdf',
    html: 'html',
    json: 'json',
  };
  const date = new Date(session.startTime);
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  const timePart = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
  const safeNonce = nonce.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 36);
  if (!safeNonce) throw new Error('Unable to create a safe export destination.');
  const exportRoot = resolve(outputRoot, 'exports');
  const destination = resolve(join(
    exportRoot,
    `${exportSlug(options.projectName)}-feedback-${datePart}-${timePart}-${safeNonce}.${extensions[options.format]}`,
  ));
  const child = relative(exportRoot, destination);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Unable to create a contained export destination.');
  }
  return destination;
}

/**
 * Resolve the main-owned export root before handing a path to ExportService.
 * Existing links are rejected instead of followed so a renderer request can
 * never leverage a pre-created `exports` link to select an arbitrary target.
 */
export async function prepareReviewExportDestination(
  outputRoot: string,
  session: ReviewSession,
  options: SanitizedReviewExportOptions,
  nonce = randomUUID(),
): Promise<string> {
  const requestedOutputRoot = resolve(outputRoot);
  await mkdir(requestedOutputRoot, { recursive: true });
  const outputRootStats = await stat(requestedOutputRoot);
  if (!outputRootStats.isDirectory()) {
    throw new Error('The configured output root is not a directory.');
  }
  const resolvedOutputRoot = await realpath(requestedOutputRoot);
  const requestedExportRoot = join(resolvedOutputRoot, 'exports');

  try {
    await mkdir(requestedExportRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new Error(`Unable to create the export directory: ${(error as Error).message}`);
    }
  }

  const exportRootStats = await lstat(requestedExportRoot);
  if (exportRootStats.isSymbolicLink()) {
    throw new Error('The export directory must not be a symbolic link.');
  }
  if (!exportRootStats.isDirectory()) {
    throw new Error('The export path is not a directory.');
  }

  const resolvedExportRoot = await realpath(requestedExportRoot);
  const exportRootChild = relative(resolvedOutputRoot, resolvedExportRoot);
  if (!exportRootChild || exportRootChild.startsWith('..') || isAbsolute(exportRootChild)) {
    throw new Error('The export directory is outside the configured output root.');
  }

  const suggestedDestination = createReviewExportDestination(
    resolvedOutputRoot,
    session,
    options,
    nonce,
  );
  const destination = resolve(resolvedExportRoot, basename(suggestedDestination));
  const destinationChild = relative(resolvedExportRoot, destination);
  if (!destinationChild || destinationChild.startsWith('..') || isAbsolute(destinationChild)) {
    throw new Error('Unable to create a contained export destination.');
  }
  return destination;
}
