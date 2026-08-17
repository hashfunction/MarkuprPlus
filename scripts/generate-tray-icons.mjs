/**
 * Generate tray icons for all states and sizes
 *
 * Generates 36 runtime PNGs: four static states, one processing fallback,
 * and four processing animation frames at 16x16 and 32x32 in normal/Template variants.
 *
 * States:
 * - idle: gray outline circle (microphone shape)
 * - recording: red filled circle with pulse animation support
 * - processing: dashed circle with rotation frames
 * - complete: green circle with checkmark
 * - error: orange warning triangle
 *
 * Requires: sharp (already in dependencies)
 * Usage: node scripts/generate-tray-icons.mjs
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '../assets');

// Icon dimensions
const SIZES = [
  { suffix: '', size: 16 },
  { suffix: '@2x', size: 32 },
];

// Colors from design spec
const COLORS = {
  gray: '#6B7280',
  red: '#EF4444',
  green: '#10B981',
  orange: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
};

/**
 * Generate SVG for idle state (microphone/circle outline)
 */
function generateIdleSvg(size, isTemplate = false) {
  const color = isTemplate ? COLORS.black : COLORS.gray;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-width="1.5"/>
    </svg>
  `.trim();
}

/**
 * Generate SVG for recording state (filled red circle)
 */
function generateRecordingSvg(size, isTemplate = false) {
  const color = isTemplate ? COLORS.black : COLORS.red;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5" fill="${color}"/>
    </svg>
  `.trim();
}

/**
 * Generate SVG for processing state with rotation
 * @param {number} size - Icon size
 * @param {number} rotation - Rotation angle in degrees (0, 90, 180, 270)
 * @param {boolean} isTemplate - Whether this is a template image for macOS
 */
function generateProcessingSvg(size, rotation = 0, isTemplate = false) {
  const color = isTemplate ? COLORS.black : COLORS.gray;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${rotation} 8 8)">
        <circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-width="1.5"
                stroke-dasharray="4 3" stroke-linecap="round"/>
      </g>
    </svg>
  `.trim();
}

/**
 * Generate SVG for complete state (green checkmark in circle)
 */
function generateCompleteSvg(size, isTemplate = false) {
  const circle = isTemplate
    ? `<circle cx="8" cy="8" r="6" fill="none" stroke="${COLORS.black}" stroke-width="1.5"/>`
    : `<circle cx="8" cy="8" r="6" fill="${COLORS.green}"/>`;
  const glyphColor = isTemplate ? COLORS.black : COLORS.white;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      ${circle}
      <path d="M5 8l2 2 4-4" stroke="${glyphColor}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim();
}

/**
 * Generate SVG for error state (warning triangle)
 */
function generateErrorSvg(size, isTemplate = false) {
  const triangle = isTemplate
    ? `<path d="M8 2L14 13H2L8 2Z" fill="none" stroke="${COLORS.black}" stroke-width="1.5" stroke-linejoin="round"/>`
    : `<path d="M8 2L14 13H2L8 2Z" fill="${COLORS.orange}"/>`;
  const glyphColor = isTemplate ? COLORS.black : COLORS.white;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      ${triangle}
      <path d="M8 5.5V9" stroke="${glyphColor}" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="11.25" r="0.75" fill="${glyphColor}"/>
    </svg>
  `.trim();
}

/**
 * Convert SVG to PNG using sharp
 */
async function svgToPng(svg, outputPath, targetSize) {
  await sharp(Buffer.from(svg))
    .resize(targetSize, targetSize)
    .png()
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.format !== 'png'
    || metadata.width !== targetSize
    || metadata.height !== targetSize) {
    throw new Error(
      `Generated runtime tray asset has unexpected dimensions: ${outputPath} `
      + `(expected ${targetSize}x${targetSize} PNG, received `
      + `${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'} `
      + `${metadata.format ?? 'unknown'})`,
    );
  }
}

/**
 * Generate all icon files
 */
async function generateIcons() {
  // Ensure assets directory exists
  if (!existsSync(ASSETS_DIR)) {
    await mkdir(ASSETS_DIR, { recursive: true });
    console.log(`Created assets directory: ${ASSETS_DIR}`);
  }

  const generated = [];
  const errors = [];

  // State definitions
  const states = [
    { name: 'idle', generator: generateIdleSvg },
    { name: 'recording', generator: generateRecordingSvg },
    { name: 'complete', generator: generateCompleteSvg },
    { name: 'error', generator: generateErrorSvg },
  ];

  // Generate static state icons
  for (const state of states) {
    for (const { suffix, size } of SIZES) {
      // Normal colored version
      const normalFilename = `tray-${state.name}${suffix}.png`;
      const normalPath = join(ASSETS_DIR, normalFilename);
      try {
        const svg = state.generator(size, false);
        await svgToPng(svg, normalPath, size);
        generated.push(normalFilename);
      } catch (err) {
        errors.push({ file: normalFilename, error: err.message });
      }

      // Template version for macOS (auto dark/light mode)
      const templateFilename = `tray-${state.name}Template${suffix}.png`;
      const templatePath = join(ASSETS_DIR, templateFilename);
      try {
        const svg = state.generator(size, true);
        await svgToPng(svg, templatePath, size);
        generated.push(templateFilename);
      } catch (err) {
        errors.push({ file: templateFilename, error: err.message });
      }
    }
  }

  // Generate processing animation frames (4 frames at 0, 90, 180, 270 degrees)
  const processingFrames = [0, 1, 2, 3];
  const rotations = [0, 90, 180, 270];

  for (let i = 0; i < processingFrames.length; i++) {
    const frame = processingFrames[i];
    const rotation = rotations[i];

    for (const { suffix, size } of SIZES) {
      // Normal colored version
      const normalFilename = `tray-processing-${frame}${suffix}.png`;
      const normalPath = join(ASSETS_DIR, normalFilename);
      try {
        const svg = generateProcessingSvg(size, rotation, false);
        await svgToPng(svg, normalPath, size);
        generated.push(normalFilename);
      } catch (err) {
        errors.push({ file: normalFilename, error: err.message });
      }

      // Template version for macOS
      const templateFilename = `tray-processing-${frame}Template${suffix}.png`;
      const templatePath = join(ASSETS_DIR, templateFilename);
      try {
        const svg = generateProcessingSvg(size, rotation, true);
        await svgToPng(svg, templatePath, size);
        generated.push(templateFilename);
      } catch (err) {
        errors.push({ file: templateFilename, error: err.message });
      }
    }
  }

  // Also generate a static processing icon (for fallback)
  for (const { suffix, size } of SIZES) {
    const normalFilename = `tray-processing${suffix}.png`;
    const normalPath = join(ASSETS_DIR, normalFilename);
    try {
      const svg = generateProcessingSvg(size, 0, false);
      await svgToPng(svg, normalPath, size);
      generated.push(normalFilename);
    } catch (err) {
      errors.push({ file: normalFilename, error: err.message });
    }

    const templateFilename = `tray-processingTemplate${suffix}.png`;
    const templatePath = join(ASSETS_DIR, templateFilename);
    try {
      const svg = generateProcessingSvg(size, 0, true);
      await svgToPng(svg, templatePath, size);
      generated.push(templateFilename);
    } catch (err) {
      errors.push({ file: templateFilename, error: err.message });
    }
  }

  // Summary
  console.log('\n=== Tray Icon Generation Complete ===\n');
  console.log(`Generated: ${generated.length} icons`);

  if (generated.length > 0) {
    console.log('\nGenerated files:');
    generated.forEach((f) => console.log(`  - ${f}`));
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(({ file, error }) => console.log(`  - ${file}: ${error}`));
    throw new Error(
      `Failed to generate ${errors.length} runtime tray assets:\n`
      + errors.map(({ file, error }) => `${file}: ${error}`).join('\n'),
    );
  }

  if (generated.length !== 36) {
    throw new Error(`Expected 36 runtime tray assets, generated ${generated.length}.`);
  }

  console.log('\nIcon states:');
  console.log('  - idle: Gray circle outline (ready to record)');
  console.log('  - recording: Red filled circle');
  console.log('  - processing: Gray dashed circle (4 rotation frames)');
  console.log('  - complete: Green circle with checkmark');
  console.log('  - error: Orange warning triangle');

  return { generated, errors };
}

// Run the generator
generateIcons().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exitCode = 1;
});
