import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
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
import {
  decodeTrustedImageBase64,
  inspectTrustedImageBytes,
  MAX_TRUSTED_IMAGE_BYTES,
} from './TrustedImageMedia';

export type SanitizedReviewExportOptions = ReviewExportOptions;

const EXPORT_FORMATS = new Set<ReviewExportFormat>(['markdown', 'pdf', 'html', 'json']);
const EXPORT_THEMES = new Set<ReviewExportTheme>(['dark', 'light']);
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_TOTAL_SCREENSHOT_BYTES = 48 * 1024 * 1024;

export interface TrustedReviewExportContext {
  mainOwnedSession: ReviewSession | null;
  sessionDirectory: string | null;
  resolveSessionDirectory?: () => Promise<string | null>;
  outputRoot: string;
  format: ReviewExportFormat;
  includeImages: boolean;
}

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

function isStrictlyContained(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return Boolean(child) && !child.startsWith('..') && !isAbsolute(child);
}

async function trustedSessionRoots(
  outputRoot: string,
  sessionDirectory: string,
): Promise<{ outputRoot: string; sessionDirectory: string }> {
  const requestedOutputRoot = resolve(outputRoot);
  const outputStats = await lstat(requestedOutputRoot);
  if (outputStats.isSymbolicLink() || !outputStats.isDirectory()) {
    throw new Error('The configured output root is unsafe for screenshot export.');
  }
  const resolvedOutputRoot = await realpath(requestedOutputRoot);
  const requestedSessionDirectory = resolve(sessionDirectory);
  const sessionStats = await lstat(requestedSessionDirectory);
  if (sessionStats.isSymbolicLink() || !sessionStats.isDirectory()) {
    throw new Error('The saved session directory is unsafe for screenshot export.');
  }
  const resolvedSessionDirectory = await realpath(requestedSessionDirectory);
  if (!isStrictlyContained(resolvedOutputRoot, resolvedSessionDirectory)) {
    throw new Error('The saved session directory is outside the configured output root.');
  }
  return {
    outputRoot: resolvedOutputRoot,
    sessionDirectory: resolvedSessionDirectory,
  };
}

/** Sanitize renderer edits and hydrate image bytes only from main-owned evidence. */
export async function trustedReviewExportSession(
  rendererSession: ReviewSession,
  context: TrustedReviewExportContext,
): Promise<ReviewSession> {
  const sanitized = sanitizeReviewSession(rendererSession);
  if (sanitized.endTime === undefined) {
    throw new Error('Only a completed review session can be exported.');
  }
  if (sanitized.feedbackItems.length === 0) {
    throw new Error('The completed session has no feedback to export.');
  }

  const mainOwnedSession = context.mainOwnedSession;
  if (
    !mainOwnedSession
    || mainOwnedSession.id !== sanitized.id
    || mainOwnedSession.startTime !== sanitized.startTime
  ) {
    throw new Error('A matching main-owned review session is required for export.');
  }
  if (!Number.isFinite(mainOwnedSession.endTime)) {
    throw new Error('A completed main-owned review session is required for export.');
  }

  const shouldHydrateImages = context.format !== 'json' && context.includeImages;
  const trustedItems = new Map(mainOwnedSession.feedbackItems.map((item) => [item.id, item]));
  let totalScreenshotBytes = 0;
  let rootsPromise: Promise<{ outputRoot: string; sessionDirectory: string }> | null = null;
  let sessionDirectoryPromise: Promise<string | null> | null = null;

  const resolveSavedSessionDirectory = (): Promise<string | null> => {
    sessionDirectoryPromise ??= context.resolveSessionDirectory
      ? context.resolveSessionDirectory()
      : Promise.resolve(context.sessionDirectory);
    return sessionDirectoryPromise;
  };

  const hydrateScreenshot = async (
    screenshot: ReviewSession['feedbackItems'][number]['screenshots'][number],
    trusted: ReviewSession['feedbackItems'][number]['screenshots'][number] | undefined,
  ) => {
    if (!trusted) {
      throw new Error(`Requested screenshot ${screenshot.id} is unavailable for export.`);
    }
    let bytes: Buffer;
    let media;
    if (trusted.imagePath) {
      const sessionDirectory = await resolveSavedSessionDirectory();
      if (!sessionDirectory) {
        throw new Error(`Requested screenshot ${screenshot.id} has no saved session directory.`);
      }
      rootsPromise ??= trustedSessionRoots(context.outputRoot, sessionDirectory);
      const roots = await rootsPromise;
      const requestedImage = isAbsolute(trusted.imagePath)
        ? resolve(trusted.imagePath)
        : resolve(roots.sessionDirectory, trusted.imagePath);
      let imageStats;
      try {
        imageStats = await lstat(requestedImage);
      } catch {
        throw new Error(`Requested screenshot ${screenshot.id} is unavailable for export.`);
      }
      if (imageStats.isSymbolicLink()) {
        throw new Error(`Requested screenshot ${screenshot.id} must not be a symbolic link.`);
      }
      if (!imageStats.isFile()) {
        throw new Error(`Requested screenshot ${screenshot.id} is not a regular file.`);
      }
      if (imageStats.size > MAX_TRUSTED_IMAGE_BYTES) {
        throw new Error(`Requested screenshot ${screenshot.id} exceeds the export size limit.`);
      }
      const resolvedImage = await realpath(requestedImage);
      if (
        !isStrictlyContained(roots.sessionDirectory, resolvedImage)
        || !isStrictlyContained(roots.outputRoot, resolvedImage)
      ) {
        throw new Error(`Requested screenshot ${screenshot.id} is outside the saved session.`);
      }
      const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
      const imageHandle = await open(resolvedImage, fsConstants.O_RDONLY | noFollow);
      try {
        const openedStats = await imageHandle.stat();
        if (!openedStats.isFile()) {
          throw new Error(`Requested screenshot ${screenshot.id} is not a regular file.`);
        }
        if (openedStats.size > MAX_TRUSTED_IMAGE_BYTES) {
          throw new Error(`Requested screenshot ${screenshot.id} exceeds the export size limit.`);
        }
        bytes = await imageHandle.readFile();
      } finally {
        await imageHandle.close();
      }
      media = inspectTrustedImageBytes(bytes, screenshot.id);
    } else if (trusted.base64) {
      const decoded = decodeTrustedImageBase64(trusted.base64, screenshot.id);
      bytes = decoded.bytes;
      media = decoded.media;
    } else {
      throw new Error(`Requested screenshot ${screenshot.id} is unavailable for export.`);
    }
    if (bytes.length > MAX_TRUSTED_IMAGE_BYTES) {
      throw new Error(`Requested screenshot ${screenshot.id} exceeds the export size limit.`);
    }
    totalScreenshotBytes += bytes.length;
    if (totalScreenshotBytes > MAX_TOTAL_SCREENSHOT_BYTES) {
      throw new Error('Requested screenshots exceed the total export size limit.');
    }
    return {
      ...screenshot,
      imagePath: '',
      base64: bytes.toString('base64'),
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
    };
  };

  const feedbackItems: ReviewSession['feedbackItems'] = [];
  for (const item of sanitized.feedbackItems) {
    const trustedItem = trustedItems.get(item.id);
    if (!trustedItem) {
      throw new Error(`Review item ${item.id} has no matching main-owned item.`);
    }
    const trustedScreenshotMetadata = trustedItem.screenshots.map((screenshot) => ({
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      imagePath: '',
      base64: undefined,
      width: screenshot.width,
      height: screenshot.height,
    }));
    const trustedReviewItem = {
      id: trustedItem.id,
      transcription: item.transcription,
      timestamp: trustedItem.timestamp,
      screenshots: trustedScreenshotMetadata,
      ...(trustedItem.title ? { title: trustedItem.title } : {}),
      ...(trustedItem.keywords ? { keywords: [...trustedItem.keywords] } : {}),
      ...(item.category ? { category: item.category } : {}),
      ...(item.severity ? { severity: item.severity } : {}),
      ...(trustedItem.reviewItemKind === 'marked-issue'
        ? { reviewItemKind: 'marked-issue' as const }
        : { reviewItemKind: 'feedback' as const }),
      ...(trustedItem.reviewItemKind === 'marked-issue'
        && trustedItem.markedIssueOrdinal !== undefined
        ? { markedIssueOrdinal: trustedItem.markedIssueOrdinal }
        : {}),
    };
    if (context.format === 'json') {
      feedbackItems.push(trustedReviewItem);
      continue;
    }
    if (!shouldHydrateImages) {
      feedbackItems.push(trustedReviewItem);
      continue;
    }
    const trustedScreenshots = new Map(
      (trustedItem?.screenshots ?? []).map((screenshot) => [screenshot.id, screenshot]),
    );
    const screenshots = [];
    for (const screenshot of trustedScreenshotMetadata) {
      screenshots.push(await hydrateScreenshot(screenshot, trustedScreenshots.get(screenshot.id)));
    }
    feedbackItems.push({ ...trustedReviewItem, screenshots });
  }

  return {
    id: mainOwnedSession.id,
    startTime: mainOwnedSession.startTime,
    endTime: mainOwnedSession.endTime,
    feedbackItems,
    metadata: {
      ...(mainOwnedSession.metadata?.os
        ? { os: mainOwnedSession.metadata.os }
        : {}),
      ...(mainOwnedSession.metadata?.sourceName
        ? { sourceName: mainOwnedSession.metadata.sourceName }
        : {}),
      ...(mainOwnedSession.metadata?.sourceType
        ? { sourceType: mainOwnedSession.metadata.sourceType }
        : {}),
      ...(mainOwnedSession.metadata?.videoStartTime !== undefined
        ? { videoStartTime: mainOwnedSession.metadata.videoStartTime }
        : {}),
    },
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
  let outputRootStats;
  try {
    outputRootStats = await lstat(requestedOutputRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(requestedOutputRoot, { recursive: true });
    outputRootStats = await lstat(requestedOutputRoot);
  }
  if (outputRootStats.isSymbolicLink()) {
    throw new Error('The configured output root must not be a symbolic link.');
  }
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
  const suggestedName = basename(suggestedDestination);
  const extension = extname(suggestedName);
  const uniqueDirectory = await mkdtemp(join(
    resolvedExportRoot,
    `${suggestedName.slice(0, -extension.length)}-`,
  ));
  try {
    await chmod(uniqueDirectory, 0o700);
    const resolvedUniqueDirectory = await realpath(uniqueDirectory);
    const uniqueDirectoryChild = relative(resolvedExportRoot, resolvedUniqueDirectory);
    if (
      !uniqueDirectoryChild
      || uniqueDirectoryChild.startsWith('..')
      || isAbsolute(uniqueDirectoryChild)
    ) {
      throw new Error('Unable to create a contained export directory.');
    }
    const destination = resolve(
      resolvedUniqueDirectory,
      `${exportSlug(options.projectName)}-feedback${extension}`,
    );
    const destinationChild = relative(resolvedUniqueDirectory, destination);
    if (!destinationChild || destinationChild.startsWith('..') || isAbsolute(destinationChild)) {
      throw new Error('Unable to create a contained export destination.');
    }
    return destination;
  } catch (error) {
    await rm(uniqueDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Execute one export inside a freshly allocated namespace and remove partial
 * artifacts if the exporter reports or throws a failure.
 */
export async function runReviewExportInPrivateDirectory<T extends { success: boolean }>(
  outputRoot: string,
  session: ReviewSession,
  options: SanitizedReviewExportOptions,
  operation: (outputPath: string) => Promise<T>,
): Promise<T> {
  const outputPath = await prepareReviewExportDestination(outputRoot, session, options);
  const privateDirectory = dirname(outputPath);
  try {
    const result = await operation(outputPath);
    if (!result.success) {
      await rm(privateDirectory, { recursive: true, force: true });
    }
    return result;
  } catch (error) {
    try {
      await rm(privateDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'The export failed and its partial artifacts could not be removed.',
      );
    }
    throw error;
  }
}
