#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/release"
PACKAGE_NAME="second-brain-graph-windows-wsl"
ZIP_PATH="$PACKAGE_DIR/$PACKAGE_NAME.zip"

mkdir -p "$PACKAGE_DIR"
rm -f "$ZIP_PATH"

cd "$ROOT_DIR"

zip -r "$ZIP_PATH" . \
  -x ".git/*" \
  -x ".agents/*" \
  -x ".claude/*" \
  -x ".env" \
  -x ".env.*" \
  -x "node_modules/*" \
  -x "dist/*" \
  -x "data/*" \
  -x "logs/*" \
  -x "projects/*" \
  -x "promo-video/*" \
  -x "promo-video-v2/*" \
  -x "release/*" \
  -x "skills-lock.json" \
  -x ".DS_Store" \
  -x "*/.DS_Store"

echo "Created: $ZIP_PATH"
