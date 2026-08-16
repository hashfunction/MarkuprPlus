# DMG Background Specification

## Current Asset
- **File**: `dmg-background.png`
- **Dimensions**: 660x400 pixels
- **Format**: PNG, 8-bit RGBA
- **Retina version**: `dmg-background@2x.png` (1320x800)

## Layout

The DMG window displays a drag-to-install interface:

```
+----------------------------------------------------------+
|                                                          |
|                                                          |
|        [App Icon]               [Applications]           |
|        MarkuprX                 alias                |
|          (180,170)               (480,170)               |
|                                                          |
|              ------->  drag  ------->                    |
|                                                          |
+----------------------------------------------------------+
```

## Icon Positions (from electron-builder.yml)
- **App icon**: x=180, y=170 (left side)
- **Applications alias**: x=480, y=170 (right side)
- **Icon size**: 100px
- **Text size**: 12px

## Design Guidelines

1. **Background**: Should have visual indication of drag direction
2. **Colors**: Match MarkuprX brand (teal/cyan accent)
3. **Style**: Clean, minimal, professional
4. **Contrast**: Ensure icons are visible against background

## Regenerating the Background

If you need to update the DMG background:

1. Create a 660x400 PNG with your design
2. Create a 1320x800 retina version (@2x)
3. Save to `build/dmg-background.png` and `build/dmg-background@2x.png`
4. Rebuild with `npm run package:mac`

## Related Configuration

See `electron-builder.yml` section `dmg:` for window and icon positioning.
