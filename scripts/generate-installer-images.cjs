#!/usr/bin/env node
/**
 * Generate Windows NSIS Installer Images
 *
 * Creates PNG versions that electron-builder will handle:
 * - installer-header.png (150x57) - Top banner in installer
 * - installer-sidebar.png (164x314) - Left sidebar wizard image
 *
 * Note: electron-builder accepts PNG and converts to BMP automatically for NSIS
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const BUILD_DIR = path.join(__dirname, '../build');
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
);
const PRODUCT_NAME = PACKAGE_JSON.productName;

if (typeof PRODUCT_NAME !== 'string' || PRODUCT_NAME.length === 0) {
  throw new Error('package.json productName is required for installer artwork');
}

// MarkuprPlus brand colors
const COLORS = {
  primary: '#6366f1',      // Indigo
  secondary: '#8b5cf6',    // Purple
  background: '#1e1e2e',   // Dark slate
  text: '#ffffff',         // White
  accent: '#22d3ee'        // Cyan accent
};

/**
 * Create installer header image (150x57)
 * This appears at the top of the installer wizard
 */
async function createInstallerHeader() {
  const width = 150;
  const height = 57;

  // Create a gradient header with public product branding
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#headerGrad)"/>
      <text x="10" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="${COLORS.text}">
        ${PRODUCT_NAME}
      </text>
    </svg>
  `;

  // Create PNG version (electron-builder handles conversion)
  const pngPath = path.join(BUILD_DIR, 'installer-header.png');
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toFile(pngPath);
  console.log(`Created: ${pngPath}`);

  // Also create BMP using raw pixel conversion
  const bmpPath = path.join(BUILD_DIR, 'installer-header.bmp');
  await createBmpFromSvg(svg, width, height, bmpPath);
  console.log(`Created: ${bmpPath}`);
}

/**
 * Create installer sidebar image (164x314)
 * This appears on the left side of the wizard-style installer
 */
async function createInstallerSidebar() {
  const width = 164;
  const height = 314;

  // Create a branded sidebar with gradient and logo area
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sidebarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
          <stop offset="50%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${COLORS.background};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#sidebarGrad)"/>

      <!-- Logo circle -->
      <circle cx="82" cy="80" r="40" fill="${COLORS.text}" fill-opacity="0.15"/>
      <circle cx="82" cy="80" r="35" fill="${COLORS.text}" fill-opacity="0.1"/>

      <!-- M monogram for MarkuprPlus -->
      <text x="82" y="95" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="${COLORS.text}" text-anchor="middle">
        M
      </text>

      <!-- App name -->
      <text x="82" y="150" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" fill="${COLORS.text}" text-anchor="middle">
        ${PRODUCT_NAME}
      </text>

      <!-- Tagline -->
      <text x="82" y="170" font-family="Segoe UI, Arial, sans-serif" font-size="9" fill="${COLORS.text}" fill-opacity="0.8" text-anchor="middle">
        AI-Ready Feedback
      </text>
      <text x="82" y="185" font-family="Segoe UI, Arial, sans-serif" font-size="9" fill="${COLORS.text}" fill-opacity="0.8" text-anchor="middle">
        Capture Tool
      </text>

      <!-- Decorative elements -->
      <circle cx="30" cy="250" r="20" fill="${COLORS.accent}" fill-opacity="0.2"/>
      <circle cx="130" cy="280" r="15" fill="${COLORS.primary}" fill-opacity="0.3"/>
      <circle cx="50" cy="290" r="10" fill="${COLORS.secondary}" fill-opacity="0.2"/>

      <!-- Version hint at bottom -->
      <text x="82" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="8" fill="${COLORS.text}" fill-opacity="0.5" text-anchor="middle">
        Setup Wizard
      </text>
    </svg>
  `;

  // Create PNG version
  const pngPath = path.join(BUILD_DIR, 'installer-sidebar.png');
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toFile(pngPath);
  console.log(`Created: ${pngPath}`);

  // Also create BMP
  const bmpPath = path.join(BUILD_DIR, 'installer-sidebar.bmp');
  await createBmpFromSvg(svg, width, height, bmpPath);
  console.log(`Created: ${bmpPath}`);
}

/**
 * Create a BMP file from SVG using raw pixel data
 * BMP format: 24-bit uncompressed
 */
async function createBmpFromSvg(svg, width, height, outputPath) {
  // Get raw RGBA pixel data
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(width, height)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // BMP is stored bottom-to-top, BGR format
  const rowSize = Math.ceil((width * 3) / 4) * 4; // Rows padded to 4-byte boundary
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize; // 54 byte header + pixel data

  const bmp = Buffer.alloc(fileSize);

  // BMP File Header (14 bytes)
  bmp.write('BM', 0);                          // Signature
  bmp.writeUInt32LE(fileSize, 2);              // File size
  bmp.writeUInt32LE(0, 6);                     // Reserved
  bmp.writeUInt32LE(54, 10);                   // Pixel data offset

  // DIB Header (40 bytes - BITMAPINFOHEADER)
  bmp.writeUInt32LE(40, 14);                   // DIB header size
  bmp.writeInt32LE(width, 18);                 // Width
  bmp.writeInt32LE(height, 22);                // Height (positive = bottom-up)
  bmp.writeUInt16LE(1, 26);                    // Color planes
  bmp.writeUInt16LE(24, 28);                   // Bits per pixel
  bmp.writeUInt32LE(0, 30);                    // Compression (0 = none)
  bmp.writeUInt32LE(pixelDataSize, 34);        // Image size
  bmp.writeInt32LE(2835, 38);                  // X pixels per meter (~72 DPI)
  bmp.writeInt32LE(2835, 42);                  // Y pixels per meter
  bmp.writeUInt32LE(0, 46);                    // Colors in color table
  bmp.writeUInt32LE(0, 50);                    // Important colors

  // Pixel data (bottom-to-top, BGR)
  const channels = info.channels; // Should be 3 (RGB) or 4 (RGBA)

  for (let y = height - 1; y >= 0; y--) {
    const bmpRow = (height - 1 - y) * rowSize + 54;
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const dstOffset = bmpRow + x * 3;

      // Convert RGB(A) to BGR
      bmp[dstOffset] = data[srcOffset + 2];     // Blue
      bmp[dstOffset + 1] = data[srcOffset + 1]; // Green
      bmp[dstOffset + 2] = data[srcOffset];     // Red
    }
  }

  fs.writeFileSync(outputPath, bmp);
}

async function main() {
  console.log('Generating Windows installer images...\n');

  // Ensure build directory exists
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  try {
    await createInstallerHeader();
    await createInstallerSidebar();

    console.log('\nDone! Windows installer images created in build/');
  } catch (error) {
    console.error('Error generating images:', error);
    process.exit(1);
  }
}

main();
