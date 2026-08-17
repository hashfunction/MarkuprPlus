#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_MODE="foreground"
DEV_MODE=0
FULL_WIPE=0
SKIP_CHECKS=0

for arg in "$@"; do
  case "$arg" in
    --detached) RUN_MODE="detached" ;;
    --dev) DEV_MODE=1 ;;
    --full-wipe) FULL_WIPE=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--dev] [--detached] [--full-wipe] [--skip-checks]"
      exit 1
      ;;
  esac
done

echo "==> Stopping MarkuprPlus and legacy processes"
PATTERNS=(
  "MarkuprPlus.app/Contents/MacOS/MarkuprPlus"
  "markuprx.app/Contents/MacOS/markuprx"
  "markuprx.app/Contents/MacOS/FeedbackFlow"
  "FeedbackFlow.app/Contents/MacOS/FeedbackFlow"
  "electron-vite dev"
  "dist/main/index.mjs"
)

for pattern in "${PATTERNS[@]}"; do
  pkill -f "$pattern" 2>/dev/null || true
done

sleep 1

for pattern in "${PATTERNS[@]}"; do
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "force killing remaining process pattern: $pattern"
    pkill -9 -f "$pattern" 2>/dev/null || true
  fi
done

sleep 1

echo "==> Removing previous installed artifacts"
TARGETS=(
  "/Applications/MarkuprPlus.app"
  "/Applications/markuprx.app"
  "/Applications/FeedbackFlow.app"
  "$HOME/Applications/MarkuprPlus.app"
  "$HOME/Applications/markuprx.app"
  "$HOME/Applications/FeedbackFlow.app"
  "$HOME/Library/Preferences/com.eddiesanjuan.markuprx.plist"
  "$HOME/Library/Preferences/com.markuprx.app.plist"
  "$HOME/Library/Preferences/com.eddiesanjuan.feedbackflow.plist"
  "$HOME/Library/Preferences/com.feedbackflow.app.plist"
  "$HOME/Library/Caches/com.eddiesanjuan.markuprx"
  "$HOME/Library/Caches/com.markuprx.app"
  "$HOME/Library/Caches/com.eddiesanjuan.feedbackflow"
  "$HOME/Library/Caches/com.feedbackflow.app"
  "$HOME/Library/Saved Application State/com.eddiesanjuan.markuprx.savedState"
  "$HOME/Library/Saved Application State/com.eddiesanjuan.feedbackflow.savedState"
)

if [[ "$FULL_WIPE" -eq 1 ]]; then
  TARGETS+=(
    "$HOME/Library/Application Support/MarkuprX"
    "$HOME/Library/Application Support/feedbackflow"
    "$HOME/Library/Application Support/markuprx"
    "$HOME/Library/Logs/feedbackflow"
    "$HOME/Library/Logs/markuprx"
  )
fi

for target in "${TARGETS[@]}"; do
  if [[ -e "$target" ]]; then
    rm -rf "$target" || true
    echo "removed: $target"
  else
    echo "absent:  $target"
  fi
done

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  echo "==> Running validation"
  ./scripts/manual-polish-test.sh --checks-only
fi

if [[ "$DEV_MODE" -eq 1 ]]; then
  if [[ "$RUN_MODE" == "foreground" ]]; then
    echo "==> Launching MarkuprPlus (dev) in foreground"
    npm run dev
    exit 0
  fi

  echo "==> Launching MarkuprPlus (dev) in detached mode"
  mkdir -p "$HOME/Library/Logs/markuprx"
  LOG_FILE="$HOME/Library/Logs/markuprx/dev-run.log"
  : > "$LOG_FILE"

  nohup npm run dev >"$LOG_FILE" 2>&1 &
  PID=$!
  sleep 2

  if ps -p "$PID" >/dev/null 2>&1; then
    echo "Launched successfully (PID: $PID)"
    echo "Log file: $LOG_FILE"
  else
    echo "Launch failed. Check log file: $LOG_FILE"
    exit 1
  fi

  exit 0
fi

echo "==> Building production app"
npm run build
npx electron-builder --mac --arm64 --dir --config electron-builder.yml

APP_SRC="$ROOT_DIR/release/mac-arm64/MarkuprPlus.app"
if [[ ! -d "$APP_SRC" ]]; then
  echo "Build succeeded but MarkuprPlus.app was not found in release/mac-arm64/"
  exit 1
fi

APP_DEST="/Applications/MarkuprPlus.app"
echo "==> Installing fresh app bundle"
rm -rf "$APP_DEST"
cp -R "$APP_SRC" "$APP_DEST"
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true

echo "==> Launching installed app"
open -na "$APP_DEST"
echo "Launched: $APP_DEST"
echo "Tip: run with --full-wipe only when you explicitly want to clear downloaded models/data."
