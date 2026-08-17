import { createRequire } from 'node:module';
import type { ScreenshotMimeType } from '../../shared/types';

// Electron 28 embeds a Node runtime that cannot parse sharp 0.35's ESM import
// attributes. Loading the package's supported CommonJS export keeps the same
// native decoder available in both Electron and current standalone Node.
const sharp = createRequire(import.meta.url)('sharp') as typeof import('sharp').default;

export const MAX_TRUSTED_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_TRUSTED_IMAGE_DIMENSION = 16_384;
export const MAX_TRUSTED_IMAGE_PIXELS = 64 * 1024 * 1024;

export interface TrustedImageMedia {
  mimeType: ScreenshotMimeType;
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

export interface DecodedTrustedImage {
  bytes: Buffer;
  media: TrustedImageMedia;
}

const MIME_EXTENSIONS: Record<ScreenshotMimeType, TrustedImageMedia['extension']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const SHARP_FORMAT_MIME_TYPES = new Map<string, ScreenshotMimeType>([
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
]);
const MAX_DATA_URL_HEADER_LENGTH = 64;

function hasBytes(bytes: Buffer, offset: number, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 33
    || !hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return null;
  }

  let offset = 8;
  let dimensions: { width: number; height: number } | null = null;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkType = bytes.toString('ascii', offset + 4, offset + 8);
    const dataOffset = offset + 8;
    const availableDataAndCrc = bytes.length - dataOffset;
    if (availableDataAndCrc < 4 || chunkLength > availableDataAndCrc - 4) return null;
    const nextOffset = dataOffset + chunkLength + 4;

    if (offset === 8) {
      if (chunkType !== 'IHDR' || chunkLength !== 13) return null;
      dimensions = {
        width: bytes.readUInt32BE(dataOffset),
        height: bytes.readUInt32BE(dataOffset + 4),
      };
    } else if (chunkType === 'IHDR') {
      return null;
    }

    if (chunkType === 'IDAT') sawImageData = true;
    if (chunkType === 'IEND') {
      return chunkLength === 0 && sawImageData && nextOffset === bytes.length
        ? dimensions
        : null;
    }
    offset = nextOffset;
  }
  return null;
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || !hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return null;
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) return offset === bytes.length ? dimensions : null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (dimensions || segmentLength < 8) return null;
      const componentCount = bytes[offset + 7];
      if (componentCount === 0 || segmentLength !== 8 + (componentCount * 3)) return null;
      dimensions = {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    if (marker === 0xda) {
      return dimensions
        && bytes.length >= 2
        && hasBytes(bytes, bytes.length - 2, [0xff, 0xd9])
        ? dimensions
        : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 20
    || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const declaredContainerSize = bytes.readUInt32LE(4) + 8;
  if (declaredContainerSize !== bytes.length) return null;
  const chunkType = bytes.toString('ascii', 12, 16);
  const chunkSize = bytes.readUInt32LE(16);
  const paddedChunkSize = chunkSize + (chunkSize % 2);
  if (paddedChunkSize > bytes.length - 20) return null;

  if (chunkType === 'VP8X' && chunkSize >= 10) {
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
    };
  }
  if (
    chunkType === 'VP8 '
    && chunkSize >= 10
    && hasBytes(bytes, 23, [0x9d, 0x01, 0x2a])
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunkType === 'VP8L' && chunkSize >= 5 && bytes[20] === 0x2f) {
    const dimensions = bytes.readUInt32LE(21);
    return {
      width: (dimensions & 0x3fff) + 1,
      height: ((dimensions >>> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function validateDimensions(
  screenshotId: string,
  dimensions: { width: number; height: number },
): void {
  const { width, height } = dimensions;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > MAX_TRUSTED_IMAGE_DIMENSION
    || height > MAX_TRUSTED_IMAGE_DIMENSION
  ) {
    throw new Error(`Requested screenshot ${screenshotId} has invalid or excessive image dimensions.`);
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_TRUSTED_IMAGE_PIXELS) {
    throw new Error(`Requested screenshot ${screenshotId} exceeds the image pixel limit.`);
  }
}

export async function inspectTrustedImageBytes(
  bytes: Buffer,
  screenshotId: string,
): Promise<TrustedImageMedia> {
  let mimeType: ScreenshotMimeType;
  let dimensions: { width: number; height: number } | null;
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    mimeType = 'image/png';
    dimensions = pngDimensions(bytes);
  } else if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    mimeType = 'image/jpeg';
    dimensions = jpegDimensions(bytes);
  } else if (
    bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    mimeType = 'image/webp';
    dimensions = webpDimensions(bytes);
  } else {
    throw new Error(
      `Requested screenshot ${screenshotId} does not have a supported PNG, JPEG, or WebP image signature.`,
    );
  }
  if (!dimensions) {
    throw new Error(`Requested screenshot ${screenshotId} has malformed ${mimeType} image data.`);
  }
  validateDimensions(screenshotId, dimensions);

  try {
    const decoderOptions = {
      failOn: 'warning' as const,
      limitInputPixels: MAX_TRUSTED_IMAGE_PIXELS,
    };
    const metadata = await sharp(bytes, decoderOptions).metadata();
    const decodedMimeType = metadata.format
      ? SHARP_FORMAT_MIME_TYPES.get(metadata.format)
      : undefined;
    if (
      decodedMimeType !== mimeType
      || metadata.width !== dimensions.width
      || metadata.height !== dimensions.height
    ) {
      throw new Error('decoded image metadata did not match its validated container');
    }
    validateDimensions(screenshotId, {
      width: metadata.width,
      height: metadata.height,
    });
    // Metadata parsing alone accepts some corrupt containers. Force libvips to
    // decode and re-encode the bounded image before trusting its source bytes.
    await sharp(bytes, decoderOptions).toBuffer();
  } catch (error) {
    throw new Error(
      `Requested screenshot ${screenshotId} has corrupt or non-decodable ${mimeType} image data.`,
      { cause: error },
    );
  }

  return {
    mimeType,
    extension: MIME_EXTENSIONS[mimeType],
    ...dimensions,
  };
}

export async function decodeTrustedImageBase64(
  value: string,
  screenshotId: string,
  maximumBytes = MAX_TRUSTED_IMAGE_BYTES,
  expectedMimeType?: ScreenshotMimeType,
): Promise<DecodedTrustedImage> {
  const maximumEncodedLength = Math.ceil(maximumBytes / 3) * 4;
  if (value.length > maximumEncodedLength + MAX_DATA_URL_HEADER_LENGTH + 1) {
    throw new Error(`Requested screenshot ${screenshotId} exceeds the export size limit.`);
  }

  let declaredMimeType: string | undefined;
  let encoded = value;
  if (value.slice(0, 5).toLowerCase() === 'data:') {
    const boundedHeader = value.slice(0, MAX_DATA_URL_HEADER_LENGTH + 1);
    const separator = boundedHeader.indexOf(',');
    const header = separator >= 0 ? value.slice(5, separator).toLowerCase() : '';
    if (separator < 0 || !header.endsWith(';base64')) {
      throw new Error(`Requested screenshot ${screenshotId} has invalid main-owned image data.`);
    }
    declaredMimeType = header.slice(0, -';base64'.length);
    if (!(declaredMimeType in MIME_EXTENSIONS)) {
      throw new Error(
        `Requested screenshot ${screenshotId} must declare PNG, JPEG, or WebP image data.`,
      );
    }
    if (value.length - separator - 1 > maximumEncodedLength) {
      throw new Error(`Requested screenshot ${screenshotId} exceeds the export size limit.`);
    }
    encoded = value.slice(separator + 1);
  }

  if (encoded.length > maximumEncodedLength) {
    throw new Error(`Requested screenshot ${screenshotId} exceeds the export size limit.`);
  }
  if (!encoded || !/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) {
    throw new Error(`Requested screenshot ${screenshotId} has invalid main-owned image data.`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length === 0
    || bytes.length > maximumBytes
    || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
  ) {
    throw new Error(
      bytes.length > maximumBytes
        ? `Requested screenshot ${screenshotId} exceeds the export size limit.`
        : `Requested screenshot ${screenshotId} has invalid main-owned image data.`,
    );
  }

  const media = await inspectTrustedImageBytes(bytes, screenshotId);
  const declaredOrExpectedMime = declaredMimeType ?? expectedMimeType;
  if (declaredOrExpectedMime && declaredOrExpectedMime !== media.mimeType) {
    throw new Error(
      `Requested screenshot ${screenshotId} declared ${declaredOrExpectedMime}, but its image signature is ${media.mimeType}.`,
    );
  }
  return { bytes, media };
}

export function screenshotExtension(mimeType?: ScreenshotMimeType): TrustedImageMedia['extension'] {
  return mimeType ? MIME_EXTENSIONS[mimeType] : 'png';
}
