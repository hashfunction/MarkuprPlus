# DMG Background Image Instructions

Create a professional DMG background for MarkuprPlus installation.

## Specifications

| Property | Value |
|----------|-------|
| **Dimensions** | 660 x 400 pixels |
| **Format** | PNG |
| **Filename** | `dmg-background.png` |
| **Location** | `build/dmg-background.png` |

## Design Guidelines

### Background
- Use a gradient matching the app theme
- Primary color: `#0f172a` (slate-900)
- Secondary color: `#1e293b` (slate-800)
- Gradient direction: top-left to bottom-right

### Layout
The DMG window has two drop zones:
- **App icon** at position (180, 170) - left side
- **Applications folder** at position (480, 170) - right side

Finder renders both icons and labels. Do not add background placeholders or
duplicate `MarkuprPlus` / `Applications` labels; align any glow or decoration
to the exact centers above.

### Visual Elements

1. **Arrow Indicator**
   - Subtle arrow pointing from left (app) to right (Applications)
   - Color: `#38bdf8` (sky-400) with 50% opacity
   - Positioned between the two icons at y=220

2. **Install Text** (optional)
   - "Drag to Applications to install"
   - Font: SF Pro Display or system font
   - Color: `#94a3b8` (slate-400)
   - Position: centered, below the arrow (y~280)

3. **App Branding** (optional)
   - Small MarkuprPlus logo in top-left corner
   - Very subtle, ~40px height

### Color Palette

```
Background gradient:
  Start: #0f172a (slate-900)
  End:   #1e293b (slate-800)

Accent:
  Primary: #38bdf8 (sky-400)

Text:
  Muted: #94a3b8 (slate-400)
  Light: #e2e8f0 (slate-200)
```

## Creating the Background

### Option 1: Figma/Sketch
1. Create a 660x400 artboard
2. Apply background gradient
3. Add arrow and optional text
4. Export as PNG

### Option 2: Command Line (Simple Gradient Only)
```bash
# Using ImageMagick
convert -size 660x400 gradient:'#0f172a'-'#1e293b' build/dmg-background.png
```

### Option 3: Online Tools
- Canva (free tier works)
- Figma (free tier works)
- Photopea (free Photoshop alternative)

## Icon Requirements

### Application Icon (`icon.icns`)
- Required sizes: 16, 32, 64, 128, 256, 512, 1024 pixels
- Format: .icns (macOS icon format)
- Location: `build/icon.icns`

To create from PNG:
```bash
# Create iconset directory
mkdir icon.iconset

# Create all required sizes (starting from 1024x1024 source)
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon-1024.png --out icon.iconset/icon_512x512@2x.png

# Convert to icns
iconutil -c icns icon.iconset -o build/icon.icns
```

### DMG Icon (`dmg-icon.icns`)
- Same process as above
- Can be the same as app icon or a variation
- The application icon at `build/icon.icns` is also used for the DMG.

## File Checklist

Before building, ensure these files exist:

```
build/
├── dmg-background.png       (660x400 PNG)
├── dmg-background@2x.png    (1320x800 PNG)
└── icon.icns                (macOS app icon)
```

## Quick Placeholder

For testing, create a simple placeholder:
```bash
# Solid color placeholder (just for testing builds)
convert -size 660x400 xc:'#0f172a' build/dmg-background.png
```

The build will work with a simple background - polish it before release.
