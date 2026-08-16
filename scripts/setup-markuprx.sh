#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_INSTALL=0
SKIP_CHECKS=0

for arg in "$@"; do
  case "$arg" in
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: scripts/setup-markuprx.sh [--skip-install] [--skip-checks]"
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (>=20.9)."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
NODE_MINOR="$(node -p "process.versions.node.split('.')[1]")"
if [[ "$NODE_MAJOR" -lt 20 || ( "$NODE_MAJOR" -eq 20 && "$NODE_MINOR" -lt 9 ) ]]; then
  echo "Node.js 20.9+ is required. Detected: $(node -v)"
  exit 1
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  if [[ -d node_modules ]]; then
    echo "Dependencies already present. Skipping install."
  else
    echo "Installing dependencies..."
    npm install
  fi
fi

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  echo "Running typecheck..."
  npm run typecheck
fi

echo
echo "markuprx setup complete."
echo "Next:"
echo "  1) npm run dev"
echo "  2) ./scripts/one-click-clean-test.sh --skip-checks"
