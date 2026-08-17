#!/usr/bin/env node
/**
 * MarkuprPlus Icon Generation Script
 *
 * Generates all app icons and brand assets from SVG sources using sharp.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PROJECT_ROOT = path.join(__dirname, '..');
const SVG_SOURCE_DIR = path.join(PROJECT_ROOT, 'assets', 'svg-source');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const RENDERER_ASSETS_DIR = path.join(PROJECT_ROOT, 'src', 'renderer', 'assets');

// Ensure directories exist
[BUILD_DIR, ASSETS_DIR, RENDERER_ASSETS_DIR, SVG_SOURCE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Tray icon sizes
const TRAY_SIZES = { normal: 22, retina: 44 };

/**
 * Convert SVG to PNG at specified size using sharp
 */
async function svgToPng(svgPath, outputPath, width, height = width) {
  const svgBuffer = fs.readFileSync(svgPath);

  await sharp(svgBuffer)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height) {
    throw new Error(
      `Generated image has unexpected dimensions: ${outputPath} `
      + `(expected ${width}x${height} PNG, received `
      + `${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'} ${metadata.format ?? 'unknown'})`,
    );
  }

  console.log(`  Generated: ${path.basename(outputPath)} (${width}x${height})`);
}

/**
 * Generate main app icon in all sizes
 */
async function generateAppIcon() {
  console.log('\n=== Generating App Icon ===');

  const svgPath = path.join(SVG_SOURCE_DIR, 'icon.svg');

  if (!fs.existsSync(svgPath)) {
    throw new Error('Required icon source is missing: assets/svg-source/icon.svg');
  }

  // Generate master 1024x1024 PNG
  const masterPath = path.join(BUILD_DIR, 'icon.png');
  await svgToPng(svgPath, masterPath, 1024);

  // Generate individual sizes for iconset
  const iconsetDir = path.join(BUILD_DIR, 'icon.iconset');
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });

  // macOS iconset naming convention
  const macOsSizes = [
    { size: 16, suffix: '16x16' },
    { size: 32, suffix: '16x16@2x' },
    { size: 32, suffix: '32x32' },
    { size: 64, suffix: '32x32@2x' },
    { size: 128, suffix: '128x128' },
    { size: 256, suffix: '128x128@2x' },
    { size: 256, suffix: '256x256' },
    { size: 512, suffix: '256x256@2x' },
    { size: 512, suffix: '512x512' },
    { size: 1024, suffix: '512x512@2x' },
  ];

  for (const { size, suffix } of macOsSizes) {
    const outputPath = path.join(iconsetDir, `icon_${suffix}.png`);
    await svgToPng(svgPath, outputPath, size);
  }

  // Generate .icns using iconutil (macOS only)
  const icnsPath = path.join(BUILD_DIR, 'icon.icns');
  if (process.platform === 'darwin') {
    if (fs.existsSync(icnsPath)) fs.unlinkSync(icnsPath);
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
      console.log(`  Generated: icon.icns`);
    } catch (error) {
      throw new Error('Could not generate required icon.icns with iconutil', {
        cause: error,
      });
    }
  } else {
    console.log('  Skipping .icns generation (not on macOS)');
  }

  // Generate Windows .ico
  await generateWindowsIcon(svgPath);

  return true;
}

/**
 * Generate Windows .ico file by creating a multi-size PNG fallback
 */
async function generateWindowsIcon(svgPath) {
  console.log('\n=== Generating Windows Icon Assets ===');

  const sizes = [16, 24, 32, 48, 64, 128, 256];

  for (const size of sizes) {
    const outputPath = path.join(BUILD_DIR, `icon-${size}.png`);
    await svgToPng(svgPath, outputPath, size);
  }

  const icoPath = path.join(BUILD_DIR, 'icon.ico');
  if (fs.existsSync(icoPath)) fs.unlinkSync(icoPath);

  try {
    const png2icons = await import('png2icons');
    const input = fs.readFileSync(path.join(BUILD_DIR, 'icon.png'));
    const output = png2icons.default.createICO(input, png2icons.default.BICUBIC2, 0, true, true);
    if (!output) throw new Error('png2icons returned no ICO data');
    fs.writeFileSync(icoPath, output);
    console.log(`  Generated: icon.ico`);
  } catch (error) {
    throw new Error('Could not generate required icon.ico with png2icons', {
      cause: error,
    });
  }
}

/**
 * Generate tray icons for all states
 */
async function generateTrayIcons() {
  console.log('\n=== Generating Tray Icons ===');

  const states = ['tray-icon', 'tray-icon-recording', 'tray-icon-processing'];

  for (const state of states) {
    const svgPath = path.join(SVG_SOURCE_DIR, `${state}.svg`);

    if (!fs.existsSync(svgPath)) {
      throw new Error(`Required tray icon source is missing: ${state}.svg`);
    }

    // Generate normal size (22x22)
    const normalPath = path.join(ASSETS_DIR, `${state}.png`);
    await svgToPng(svgPath, normalPath, TRAY_SIZES.normal);

    // Generate Template version (for macOS auto-tinting)
    const templatePath = path.join(ASSETS_DIR, `${state}Template.png`);
    await svgToPng(svgPath, templatePath, TRAY_SIZES.normal);

    // Generate @2x retina versions
    const retina2xPath = path.join(ASSETS_DIR, `${state}@2x.png`);
    await svgToPng(svgPath, retina2xPath, TRAY_SIZES.retina);

    const template2xPath = path.join(ASSETS_DIR, `${state}Template@2x.png`);
    await svgToPng(svgPath, template2xPath, TRAY_SIZES.retina);
  }

}

/**
 * Generate DMG background images
 */
async function generateDmgBackground() {
  console.log('\n=== Generating DMG Background ===');

  const svgPath = path.join(SVG_SOURCE_DIR, 'dmg-background.svg');

  if (!fs.existsSync(svgPath)) {
    throw new Error('Required DMG source is missing: dmg-background.svg');
  }

  // Standard resolution (660x400)
  const normalPath = path.join(BUILD_DIR, 'dmg-background.png');
  await svgToPng(svgPath, normalPath, 660, 400);

  // Retina resolution (1320x800)
  const retinaPath = path.join(BUILD_DIR, 'dmg-background@2x.png');
  await svgToPng(svgPath, retinaPath, 1320, 800);
}

/**
 * Check logo SVGs exist
 */
async function checkLogos() {
  console.log('\n=== Checking Logo SVGs ===');

  const logos = ['logo.svg', 'logo-dark.svg'];

  for (const logo of logos) {
    const srcPath = path.join(RENDERER_ASSETS_DIR, logo);
    if (fs.existsSync(srcPath)) {
      console.log(`  Found: ${logo}`);
    } else {
      throw new Error(`Required renderer logo is missing: ${logo}`);
    }
  }
}

/**
 * Generate the transparent marketplace logo from the canonical renderer SVG.
 */
async function generateMarketplaceLogo() {
  console.log('\n=== Generating Marketplace Logo ===');

  const sourcePath = path.join(RENDERER_ASSETS_DIR, 'logo.svg');
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Required marketplace logo source is missing: logo.svg');
  }
  await svgToPng(sourcePath, path.join(ASSETS_DIR, 'logo-400.png'), 400, 400);
}

/**
 * Generate favicons for web use
 */
async function generateFavicons() {
  console.log('\n=== Generating Favicons ===');

  const svgPath = path.join(SVG_SOURCE_DIR, 'icon.svg');

  if (!fs.existsSync(svgPath)) {
    return;
  }

  const sizes = [16, 32, 48, 64, 180, 192, 512];

  for (const size of sizes) {
    const outputPath = path.join(BUILD_DIR, `favicon-${size}.png`);
    await svgToPng(svgPath, outputPath, size);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('=========================================');
  console.log('  MarkuprPlus Icon Generator (sharp)');
  console.log('=========================================');

  try {
    await generateAppIcon();
    await generateTrayIcons();
    await generateDmgBackground();
    await checkLogos();
    await generateMarketplaceLogo();
    await generateFavicons();

    console.log('\n=========================================');
    console.log('  Icon generation complete!');
    console.log('=========================================\n');

    console.log('Generated files:');
    console.log('  build/icon.png           - Master app icon (1024x1024)');
    console.log('  build/icon.icns          - macOS icon bundle');
    console.log('  build/icon-*.png         - Windows icon sizes');
    console.log('  build/dmg-background.png - DMG installer background');
    console.log('  assets/logo-400.png       - Marketplace logo (400x400)');
    console.log('  assets/tray-icon*.png    - Source-derived menu bar icons');
    console.log('  src/renderer/assets/     - In-app logo SVGs');
  } catch (error) {
    console.error('\nError during icon generation:', error);
    process.exit(1);
  }
}

main();
