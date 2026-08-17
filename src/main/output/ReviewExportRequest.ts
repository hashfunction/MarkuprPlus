import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
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

export type SanitizedReviewExportOptions = ReviewExportOptions;

const EXPORT_FORMATS = new Set<ReviewExportFormat>(['markdown', 'pdf', 'html', 'json']);
const EXPORT_THEMES = new Set<ReviewExportTheme>(['dark', 'light']);
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_SCREENSHOT_BYTES = 48 * 1024 * 1024;

export interface TrustedReviewExportContext {
  mainOwnedSession: ReviewSession | null;
  sessionDirectory: string | null;
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

function decodeMainOwnedBase64(value: string, screenshotId: string): Buffer {
  const dataUrl = /^data:image\/(?:png|jpe?g|webp);base64,(.*)$/i.exec(value);
  const encoded = dataUrl?.[1] ?? value;
  if (!encoded || !/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) {
    throw new Error(`Requested screenshot ${screenshotId} has invalid main-owned image data.`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length === 0
    || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
  ) {
    throw new Error(`Requested screenshot ${screenshotId} has invalid main-owned image data.`);
  }
  return bytes;
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

  const shouldHydrateImages = context.format !== 'json' && context.includeImages;
  const trustedItems = context.mainOwnedSession?.id === sanitized.id
    ? new Map(context.mainOwnedSession.feedbackItems.map((item) => [item.id, item]))
    : null;
  let totalScreenshotBytes = 0;
  let rootsPromise: Promise<{ outputRoot: string; sessionDirectory: string }> | null = null;

  const hydrateScreenshot = async (
    screenshot: ReviewSession['feedbackItems'][number]['screenshots'][number],
    trusted: ReviewSession['feedbackItems'][number]['screenshots'][number] | undefined,
  ) => {
    if (!trusted) {
      throw new Error(`Requested screenshot ${screenshot.id} is unavailable for export.`);
    }
    let bytes: Buffer;
    if (trusted.imagePath) {
      if (!context.sessionDirectory) {
        throw new Error(`Requested screenshot ${screenshot.id} has no saved session directory.`);
      }
      rootsPromise ??= trustedSessionRoots(context.outputRoot, context.sessionDirectory);
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
      if (imageStats.size > MAX_SCREENSHOT_BYTES) {
        throw new Error(`Requested screenshot ${screenshot.id} exceeds the export size limit.`);
      }
      const resolvedImage = await realpath(requestedImage);
      if (
        !isStrictlyContained(roots.sessionDirectory, resolvedImage)
        || !isStrictlyContained(roots.outputRoot, resolvedImage)
      ) {
        throw new Error(`Requested screenshot ${screenshot.id} is outside the saved session.`);
      }
      bytes = await readFile(resolvedImage);
    } else if (trusted.base64) {
      bytes = decodeMainOwnedBase64(trusted.base64, screenshot.id);
    } else {
      throw new Error(`Requested screenshot ${screenshot.id} is unavailable for export.`);
    }
    if (bytes.length > MAX_SCREENSHOT_BYTES) {
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
    };
  };

  const feedbackItems: ReviewSession['feedbackItems'] = [];
  for (const item of sanitized.feedbackItems) {
    const trustedItem = trustedItems?.get(item.id);
    const trustedScreenshotMetadata = (trustedItem?.screenshots ?? []).map((screenshot) => ({
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      imagePath: '',
      base64: undefined,
      width: screenshot.width,
      height: screenshot.height,
    }));
    if (context.format === 'json') {
      feedbackItems.push({
        ...item,
        screenshots: trustedScreenshotMetadata,
      });
      continue;
    }
    if (!shouldHydrateImages) {
      feedbackItems.push({ ...item, screenshots: trustedScreenshotMetadata });
      continue;
    }
    const trustedScreenshots = new Map(
      (trustedItem?.screenshots ?? []).map((screenshot) => [screenshot.id, screenshot]),
    );
    const screenshots = [];
    for (const screenshot of trustedScreenshotMetadata) {
      screenshots.push(await hydrateScreenshot(screenshot, trustedScreenshots.get(screenshot.id)));
    }
    feedbackItems.push({ ...item, screenshots });
  }

  return {
    ...sanitized,
    feedbackItems,
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
