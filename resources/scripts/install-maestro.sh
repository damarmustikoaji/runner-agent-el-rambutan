#!/bin/bash
# resources/scripts/install-maestro.sh
# Dijalankan oleh SetupManager untuk install Maestro di macOS/Linux
# Usage: ./install-maestro.sh ~/.testpilot

set -e

INSTALL_DIR="${1:-$HOME/.testpilot}"
BIN_DIR="$INSTALL_DIR/bin"
CACHE_DIR="$INSTALL_DIR/cache"

mkdir -p "$BIN_DIR" "$CACHE_DIR"

echo "[maestro] Downloading Maestro CLI..."
MAESTRO_URL="https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip"
MAESTRO_ZIP="$CACHE_DIR/maestro.zip"

curl -L --progress-bar -o "$MAESTRO_ZIP" "$MAESTRO_URL"

echo "[maestro] Extracting..."
cd "$BIN_DIR"
unzip -o "$MAESTRO_ZIP" -d "$BIN_DIR"

# Set executable
chmod +x "$BIN_DIR/maestro" 2>/dev/null || true
chmod +x "$BIN_DIR/maestro/bin/maestro" 2>/dev/null || true

rm -f "$MAESTRO_ZIP"

echo "[maestro] Done. Maestro installed at $BIN_DIR"