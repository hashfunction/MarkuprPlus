#!/usr/bin/env python3
"""
Generate an animated GIF demoing the markuprx CLI workflow.
Uses Pillow to render terminal frames and saves as an optimized GIF.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

# --- Configuration ---
WIDTH = 800
HEIGHT = 720
BG_COLOR = (30, 30, 46)        # Dark background (catppuccin-ish)
TEXT_COLOR = (205, 214, 244)    # Light text
DIM_COLOR = (127, 132, 156)    # Dimmed text
GREEN = (166, 227, 161)        # Success green
CYAN = (137, 220, 235)         # Cyan accent
YELLOW = (249, 226, 175)       # Yellow accent
MAGENTA = (245, 194, 231)      # Magenta
BLUE = (137, 180, 250)         # Blue accent
WHITE = (255, 255, 255)
PROMPT_COLOR = (166, 227, 161) # Green prompt
BORDER_COLOR = (69, 71, 90)    # Subtle border

FONT_SIZE = 15
LINE_HEIGHT = 22
PADDING_X = 24
PADDING_Y = 50  # Below title bar
TITLE_BAR_H = 38

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo-cli.gif")

# --- Font Setup ---
try:
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", FONT_SIZE)
    font_bold = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", FONT_SIZE)
    font_title = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 12)
except Exception:
    font = ImageFont.load_default()
    font_bold = font
    font_title = font


def draw_title_bar(draw):
    """Draw a macOS-style title bar."""
    # Title bar background
    draw.rectangle([0, 0, WIDTH, TITLE_BAR_H], fill=(40, 42, 54))
    # Bottom border
    draw.line([0, TITLE_BAR_H, WIDTH, TITLE_BAR_H], fill=BORDER_COLOR, width=1)
    # Traffic lights
    colors_dots = [(255, 95, 86), (255, 189, 46), (39, 201, 63)]
    for i, c in enumerate(colors_dots):
        cx = 20 + i * 22
        cy = TITLE_BAR_H // 2
        draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=c)
    # Title text
    title = "Terminal -- markuprx"
    draw.text((WIDTH // 2 - 70, 11), title, fill=DIM_COLOR, font=font_title)


def create_frame(lines):
    """Create a single frame image from a list of styled line segments."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    draw_title_bar(draw)

    y = PADDING_Y
    for line in lines:
        x = PADDING_X
        if isinstance(line, str):
            draw.text((x, y), line, fill=TEXT_COLOR, font=font)
        elif isinstance(line, list):
            for segment in line:
                text, color = segment
                draw.text((x, y), text, fill=color, font=font)
                bbox = font.getbbox(text)
                x += bbox[2] - bbox[0]
        y += LINE_HEIGHT

    return img


def build_cursor_line(text, typed_so_far):
    """Build a prompt line with partial typing and a cursor."""
    visible = text[:typed_so_far]
    return [("$ ", PROMPT_COLOR), (visible, TEXT_COLOR), ("\u2588", WHITE)]


# --- Define the animation sequence ---
# Each entry: (list_of_lines, duration_ms)
# Lines can be str or list of (text, color) tuples

def generate_frames():
    frames = []

    # -- Phase 0: Empty terminal with just prompt blinking (brief) --
    for _ in range(3):
        frames.append((create_frame([
            [("$ ", PROMPT_COLOR), ("\u2588", WHITE)],
        ]), 400))
        frames.append((create_frame([
            [("$ ", PROMPT_COLOR)],
        ]), 300))

    # -- Phase 1: Type command character by character --
    command = "npx markuprx analyze ./demo-recording.mov"
    for i in range(1, len(command) + 1):
        line = [build_cursor_line(command, i)]
        # Faster typing with occasional pauses
        delay = 45
        if command[i - 1] == " ":
            delay = 100
        elif i == len(command):
            delay = 400  # Pause before Enter
        frames.append((create_frame(line), delay))

    # Brief pause showing full command
    full_cmd = [("$ ", PROMPT_COLOR), (command, TEXT_COLOR)]
    frames.append((create_frame([full_cmd]), 600))

    # -- Phase 2: Initial output --
    header_lines = [
        [("$ ", PROMPT_COLOR), (command, TEXT_COLOR)],
        [],
        [("  markuprx", CYAN), (" v2.6.0", DIM_COLOR), (" \u2014 Intelligent Developer Feedback", DIM_COLOR)],
        [],
    ]

    # Show header appearing
    frames.append((create_frame(header_lines), 800))

    # Analyzing line
    analyzing = header_lines + [
        [("  \u25b8 ", YELLOW), ("Analyzing: ", TEXT_COLOR), ("demo-recording.mov", WHITE), (" (2m 34s)", DIM_COLOR)],
        [],
    ]
    frames.append((create_frame(analyzing), 1000))

    # -- Phase 3: Transcription --
    base = analyzing

    # Transcription header
    t1 = base + [
        [("  \u25a0 ", CYAN), ("Transcription", WHITE)],
    ]
    frames.append((create_frame(t1), 500))

    t2 = base + [
        [("  \u25a0 ", CYAN), ("Transcription", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Using: ", TEXT_COLOR), ("Local Whisper (base model)", BLUE)],
    ]
    frames.append((create_frame(t2), 600))

    t3 = base + [
        [("  \u25a0 ", CYAN), ("Transcription", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Using: ", TEXT_COLOR), ("Local Whisper (base model)", BLUE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Processing audio...", DIM_COLOR)],
    ]
    frames.append((create_frame(t3), 1800))

    t4 = base + [
        [("  \u25a0 ", CYAN), ("Transcription", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Using: ", TEXT_COLOR), ("Local Whisper (base model)", BLUE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Processing audio...", DIM_COLOR)],
        [("    \u2514\u2500 ", DIM_COLOR), ("\u2713 ", GREEN), ("12 segments transcribed (2m 34s)", TEXT_COLOR)],
    ]
    frames.append((create_frame(t4), 800))

    # -- Phase 4: Frame Extraction --
    base2 = t4 + [
        [],
    ]

    f1 = base2 + [
        [("  \u25a0 ", CYAN), ("Frame Extraction", WHITE)],
    ]
    frames.append((create_frame(f1), 500))

    f2 = base2 + [
        [("  \u25a0 ", CYAN), ("Frame Extraction", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Detecting key moments from transcript...", DIM_COLOR)],
    ]
    frames.append((create_frame(f2), 1200))

    f3 = base2 + [
        [("  \u25a0 ", CYAN), ("Frame Extraction", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Detecting key moments from transcript...", DIM_COLOR)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Extracting frames at timestamps...", DIM_COLOR)],
    ]
    frames.append((create_frame(f3), 1400))

    f4 = base2 + [
        [("  \u25a0 ", CYAN), ("Frame Extraction", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Detecting key moments from transcript...", DIM_COLOR)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Extracting frames at timestamps...", DIM_COLOR)],
        [("    \u2514\u2500 ", DIM_COLOR), ("\u2713 ", GREEN), ("8 frames captured", TEXT_COLOR)],
    ]
    frames.append((create_frame(f4), 800))

    # -- Phase 5: Document Generation --
    base3 = f4 + [
        [],
    ]

    d1 = base3 + [
        [("  \u25a0 ", CYAN), ("Document Generation", WHITE)],
    ]
    frames.append((create_frame(d1), 500))

    d2 = base3 + [
        [("  \u25a0 ", CYAN), ("Document Generation", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Correlating screenshots with transcript...", DIM_COLOR)],
    ]
    frames.append((create_frame(d2), 1000))

    d3 = base3 + [
        [("  \u25a0 ", CYAN), ("Document Generation", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Correlating screenshots with transcript...", DIM_COLOR)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Building structured markdown...", DIM_COLOR)],
    ]
    frames.append((create_frame(d3), 1200))

    d4 = base3 + [
        [("  \u25a0 ", CYAN), ("Document Generation", WHITE)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Correlating screenshots with transcript...", DIM_COLOR)],
        [("    \u251c\u2500 ", DIM_COLOR), ("Building structured markdown...", DIM_COLOR)],
        [("    \u2514\u2500 ", DIM_COLOR), ("\u2713 ", GREEN), ("Document ready", TEXT_COLOR)],
    ]
    frames.append((create_frame(d4), 800))

    # -- Phase 6: Summary --
    base4 = d4 + [
        [],
    ]

    # Horizontal rule
    rule = "\u2501" * 43
    s1 = base4 + [
        [("  ", TEXT_COLOR), (rule, DIM_COLOR)],
    ]
    frames.append((create_frame(s1), 600))

    s2 = s1 + [
        [],
        [("  \u2713 ", GREEN), ("Output: ", TEXT_COLOR), ("./markuprx-output/demo-recording.md", CYAN)],
    ]
    frames.append((create_frame(s2), 800))

    s3 = s2 + [
        [],
        [("    Markdown document with ", DIM_COLOR), ("8", WHITE), (" embedded screenshots", DIM_COLOR)],
    ]
    frames.append((create_frame(s3), 500))

    s4 = s3 + [
        [("    ", TEXT_COLOR), ("3", WHITE), (" issues identified, ", DIM_COLOR), ("2", WHITE), (" suggestions captured", DIM_COLOR)],
    ]
    frames.append((create_frame(s4), 500))

    s5 = s4 + [
        [("    File path copied to clipboard", DIM_COLOR)],
    ]
    frames.append((create_frame(s5), 600))

    s6 = s5 + [
        [],
        [("  Paste into your AI coding agent to action feedback ", DIM_COLOR), ("\u2192", YELLOW)],
    ]
    frames.append((create_frame(s6), 3000))  # Hold final frame

    return frames


def main():
    print("Generating frames...")
    frames = generate_frames()
    print(f"  {len(frames)} frames generated")

    # Extract images and durations
    images = [f[0] for f in frames]
    durations = [f[1] for f in frames]

    print("Saving GIF...")
    images[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )

    size_bytes = os.path.getsize(OUTPUT_PATH)
    size_mb = size_bytes / (1024 * 1024)
    print(f"  Saved to: {OUTPUT_PATH}")
    print(f"  Size: {size_mb:.2f} MB")
    print(f"  Dimensions: {WIDTH}x{HEIGHT}")
    print(f"  Frames: {len(frames)}")

    if size_mb > 5:
        print("  WARNING: File exceeds 5MB target. Applying optimization...")
        optimize_gif(OUTPUT_PATH, images, durations)


def optimize_gif(path, images, durations):
    """Reduce colors and apply quantization to shrink file size."""
    optimized = []
    for img in images:
        optimized.append(img.quantize(colors=64, method=Image.Quantize.MEDIANCUT).convert("RGB"))

    optimized[0].save(
        path,
        save_all=True,
        append_images=optimized[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )

    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  Optimized size: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
