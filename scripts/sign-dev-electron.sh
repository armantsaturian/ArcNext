#!/usr/bin/env bash
# Re-sign the dev Electron binary with audio-input entitlement so macOS TCC
# shows the microphone permission dialog during development.
# Runs automatically via npm postinstall.

set -euo pipefail

ELECTRON_APP="node_modules/electron/dist/Electron.app"
ENTITLEMENTS="build/entitlements.dev.plist"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "[sign-dev-electron] skipping — not macOS"
  exit 0
fi

if [[ ! -d "$ELECTRON_APP" ]]; then
  echo "[sign-dev-electron] skipping — $ELECTRON_APP not found"
  exit 0
fi

if ! command -v codesign &>/dev/null; then
  echo "[sign-dev-electron] skipping — codesign not found"
  exit 0
fi

# Prefer a real Developer ID identity (required for TCC to show permission dialogs).
# Fall back to ad-hoc if none found.
IDENTITY="-"
DEV_ID=$(security find-identity -v -p codesigning 2>/dev/null \
  | grep "Developer ID Application" \
  | head -1 \
  | sed 's/.*"\(.*\)"/\1/' || true)

if [[ -n "$DEV_ID" ]]; then
  IDENTITY="$DEV_ID"
  echo "[sign-dev-electron] using identity: $IDENTITY"
else
  echo "[sign-dev-electron] no Developer ID found, using ad-hoc signing"
fi

echo "[sign-dev-electron] re-signing Electron.app with audio-input entitlement..."

# Sign helpers first (inside → out), then the main app.
# --deep on the outer app handles nested code, but signing helpers individually
# with entitlements ensures each helper process gets the entitlement.
find "$ELECTRON_APP/Contents/Frameworks" -name "*.app" -print0 | while IFS= read -r -d '' helper; do
  codesign --force --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$helper" 2>/dev/null || true
done

codesign --force --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$ELECTRON_APP"

echo "[sign-dev-electron] done"
