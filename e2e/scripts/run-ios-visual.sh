#!/usr/bin/env bash
set -euo pipefail
# Visual-regression run on the iOS simulator: play the `visual` flows, collect
# their screenshots and diff them against the committed baseline.
# Prerequisite: app installed AND logged in (same as run-ios.sh).
#
#   npm run e2e:ios:visual              # compare against the baseline
#   npm run e2e:ios:visual -- --update  # accept the current run as baseline
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"
SHOTS="$ROOT/e2e/maestro/screenshots"
RUN_DIR="$SHOTS/.maestro-run"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

rm -rf "$RUN_DIR" "$SHOTS/current"
mkdir -p "$SHOTS/current"

# --flatten-debug-output drops the per-run timestamp directory, so the shots land
# at a path this script can predict: <run>/<flow>/takeScreenshot/<name>.png.
# See e2e/DEVICE-NOTES.md for MENU_SUFFIX.
"$ROOT/e2e/scripts/maestro.sh" --platform ios test "$ROOT/e2e/maestro/flows" \
  --include-tags visual \
  --exclude-tags login \
  --debug-output "$RUN_DIR" \
  --flatten-debug-output \
  -e MENU_SUFFIX=-container-outer-layer

# Flatten every flow's shots into one directory; names are unique by convention
# (each is prefixed with its flow number).
find "$RUN_DIR" -path '*/takeScreenshot/*.png' -exec cp {} "$SHOTS/current/" \;

node "$ROOT/e2e/scripts/compare-screenshots.mjs" --current "$SHOTS/current" "$@"
