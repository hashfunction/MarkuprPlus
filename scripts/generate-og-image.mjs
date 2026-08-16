import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'site', 'og-image.png');
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const versionTag = `v${packageJson.version}`;

const width = 1200;
const height = 630;

// Colors from the site's design system
const bgColor = '#0A0A0B';
const textPrimary = '#F5F5F5';
const accent = '#F59E0B';
const textSecondary = '#A0A0A0';
const textTertiary = '#666666';
const versionBadgeWidth = 100;
const versionBadgeX = 860;
const versionBadgeCenter = versionBadgeX + versionBadgeWidth / 2;

const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&amp;display=swap');
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${bgColor}"/>

  <!-- Subtle grid pattern -->
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <rect width="40" height="40" fill="none"/>
    <rect width="1" height="1" x="0" y="0" fill="rgba(255,255,255,0.03)"/>
  </pattern>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="${width}" height="4" fill="${accent}"/>

  <!-- Bottom accent line -->
  <rect x="0" y="${height - 4}" width="${width}" height="4" fill="${accent}"/>

  <!-- MarkuprX wordmark -->
  <text x="600" y="240" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="96" font-weight="900" letter-spacing="-4">
    <tspan fill="${textPrimary}">Markup</tspan><tspan fill="${accent}">rX</tspan>
  </text>

  <!-- Tagline -->
  <text x="600" y="320" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="32" font-weight="700" fill="${textPrimary}" letter-spacing="-1">
    You see it. You say it. Your AI fixes it.
  </text>

  <!-- Subtitle -->
  <text x="600" y="380" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="400" fill="${textSecondary}">
    AI-ready developer feedback capture -- open source
  </text>

  <!-- Decorative neo-brutalist border elements -->
  <!-- Left bracket -->
  <rect x="80" y="180" width="4" height="220" fill="${accent}" opacity="0.6"/>
  <rect x="80" y="180" width="24" height="4" fill="${accent}" opacity="0.6"/>
  <rect x="80" y="396" width="24" height="4" fill="${accent}" opacity="0.6"/>

  <!-- Right bracket -->
  <rect x="${width - 84}" y="180" width="4" height="220" fill="${accent}" opacity="0.6"/>
  <rect x="${width - 104}" y="180" width="24" height="4" fill="${accent}" opacity="0.6"/>
  <rect x="${width - 104}" y="396" width="24" height="4" fill="${accent}" opacity="0.6"/>

  <!-- Bottom info bar -->
  <rect x="0" y="${height - 80}" width="${width}" height="76" fill="rgba(255,255,255,0.03)"/>
  <line x1="0" y1="${height - 80}" x2="${width}" y2="${height - 80}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <!-- GitHub icon hint -->
  <text x="200" y="${height - 34}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="600" fill="${textTertiary}">
    markuprx.com
  </text>

  <!-- Version badge -->
  <rect x="${versionBadgeX}" y="${height - 60}" width="${versionBadgeWidth}" height="28" rx="4" fill="rgba(245,158,11,0.15)" stroke="${accent}" stroke-width="2"/>
  <text x="${versionBadgeCenter}" y="${height - 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="${accent}">
    ${versionTag}
  </text>

  <!-- MIT badge -->
  <rect x="980" y="${height - 60}" width="60" height="28" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <text x="1010" y="${height - 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="600" fill="${textTertiary}">
    MIT
  </text>
</svg>`;

async function generate() {
  try {
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    const metadata = await sharp(outputPath).metadata();
    console.log(`OG image generated: ${outputPath}`);
    console.log(`Dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`Format: ${metadata.format}`);
    console.log(`Size: ${(metadata.size || 0) / 1024} KB`);
  } catch (err) {
    console.error('Failed to generate OG image:', err);
    process.exit(1);
  }
}

generate();
