#!/usr/bin/env bash
# =============================================================================
# markuprx GitHub Action Entrypoint
# =============================================================================
# Standalone script that can be used outside of the composite action.
# The composite action (action.yml) calls this for the core analysis logic.
#
# Usage:
#   ./entrypoint.sh <video-path> [options]
#
# Environment variables:
#   GITHUB_TOKEN     - GitHub token for API access
#   INPUT_TEMPLATE   - Output template (default: markdown)
#   INPUT_OUTPUT_DIR - Output directory (default: ./markuprx-output)
# =============================================================================

set -euo pipefail

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

info()  { echo "::notice::$*"; }
warn()  { echo "::warning::$*"; }
err()   { echo "::error::$*"; }
group() { echo "::group::$1"; }
endgroup() { echo "::endgroup::"; }

# --------------------------------------------------------------------------
# Arguments
# --------------------------------------------------------------------------

VIDEO_PATH="${1:?Usage: entrypoint.sh <video-path>}"
TEMPLATE="${INPUT_TEMPLATE:-markdown}"
OUTPUT_DIR="${INPUT_OUTPUT_DIR:-./markuprx-output}"

# --------------------------------------------------------------------------
# Preflight checks
# --------------------------------------------------------------------------

if [ ! -e "$VIDEO_PATH" ]; then
  err "Video path not found: $VIDEO_PATH"
  exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
  warn "ffmpeg not found — attempting install"
  if [ "$(uname)" = "Linux" ]; then
    sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
  elif [ "$(uname)" = "Darwin" ]; then
    brew install ffmpeg
  else
    err "Cannot install ffmpeg automatically on this platform"
    exit 1
  fi
fi

if ! command -v node &> /dev/null; then
  err "Node.js is required but not found"
  exit 1
fi

# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------

mkdir -p "$OUTPUT_DIR"

process_video() {
  local video="$1"
  local out_dir="$2"

  group "Analyzing $(basename "$video")"
  npx --yes markuprx@latest analyze "$video" --output "$out_dir" --verbose 2>&1 || {
    warn "Analysis failed for $(basename "$video")"
  }
  endgroup
}

if [ -d "$VIDEO_PATH" ]; then
  info "Processing directory: $VIDEO_PATH"
  shopt -s nullglob
  videos=("$VIDEO_PATH"/*.{mp4,mov,webm,mkv,avi})
  shopt -u nullglob

  if [ ${#videos[@]} -eq 0 ]; then
    warn "No video files found in $VIDEO_PATH"
    exit 0
  fi

  for video in "${videos[@]}"; do
    basename=$(basename "$video" | sed 's/\.[^.]*$//')
    process_video "$video" "$OUTPUT_DIR/$basename"
  done
else
  process_video "$VIDEO_PATH" "$OUTPUT_DIR"
fi

# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

REPORT=$(find "$OUTPUT_DIR" -name "*.md" -type f | head -1)

if [ -z "$REPORT" ]; then
  warn "No report generated"
  exit 0
fi

info "Report generated: $REPORT"

# If running inside GitHub Actions, set outputs
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "report-path=$REPORT" >> "$GITHUB_OUTPUT"
  echo "output-dir=$OUTPUT_DIR" >> "$GITHUB_OUTPUT"
fi

echo ""
echo "===== markuprx Report ====="
echo "$REPORT"
echo "=========================="
