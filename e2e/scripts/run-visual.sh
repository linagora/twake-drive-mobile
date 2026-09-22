#!/usr/bin/env bash
set -euo pipefail
# Visual run: play the `visual` flows, collect their screenshots and diff them
# against the baseline committed for that platform.
#
#   ./e2e/scripts/run-visual.sh ios                 # compare
#   ./e2e/scripts/run-visual.sh android -- --update # accept the run as baseline
#   CAPTURE_ONLY=1 ./e2e/scripts/run-visual.sh android   # capture, do not compare
#   FLOWS=e2e/maestro/flows/01-visual-tour.yaml EXCLUDE_EXTRA=none ...  # one flow
#   TOUR_FOLDER=Travail TOUR_FILE=notes ...               # point a tour elsewhere
#
# A baseline belongs to one platform: the two render at different sizes, so
# iOS and Android keep their own, and a run only ever compares against its own.
#
# Prerequisite: the app installed AND logged in, as for run-ios.sh / run-android.sh.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="${1:-ios}"
[ $# -gt 0 ] && shift
[ "${1:-}" = "--" ] && shift

case "$PLATFORM" in
  ios|android) ;;
  *) echo "Usage: $0 <ios|android> [-- --update]" >&2; exit 1 ;;
esac

SHOTS="$ROOT/e2e/maestro/screenshots"
RUN_DIR="$SHOTS/.maestro-run/$PLATFORM"
CURRENT="$SHOTS/current/$PLATFORM"
BASELINE="$SHOTS/baseline/$PLATFORM"

if [ "$PLATFORM" = ios ]; then
  SIM="${SIMULATOR:-booted}"
  xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true
  # iOS labels a row "<name>, <actions label>", which the flows absorb with this.
  EXTRA=(-e MENU_SUFFIX=-container-outer-layer)
else
  adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}' \
    || { echo "No adb device connected." >&2; exit 1; }
  EXTRA=(-e MENU_SUFFIX=)
fi

# What the tour walks, handed to the flows so a run can be pointed at another
# account's material without editing them:
#   TOUR_FOLDER=Travail TOUR_FILE=notes ./e2e/scripts/run-visual.sh ios
[ -n "${TOUR_FOLDER:-}" ] && EXTRA+=(-e "TOUR_FOLDER=$TOUR_FOLDER")
[ -n "${TOUR_FILE:-}" ] && EXTRA+=(-e "TOUR_FILE=$TOUR_FILE")

rm -rf "$RUN_DIR" "$CURRENT"
mkdir -p "$CURRENT"

# --flatten-debug-output drops the per-run timestamp directory, so the shots land
# at a path this script can predict: <run>/<flow>/takeScreenshot/<name>.png.
"$ROOT/e2e/scripts/maestro.sh" --platform "$PLATFORM" test "${FLOWS:-$ROOT/e2e/maestro/flows}" \
  --include-tags visual \
  --exclude-tags login,skip,${EXCLUDE_EXTRA:-ci} \
  --debug-output "$RUN_DIR" \
  --flatten-debug-output \
  "${EXTRA[@]}"

find "$RUN_DIR" -path '*/takeScreenshot/*.png' -exec cp {} "$CURRENT/" \;
echo "Captures in $CURRENT"

if [ -n "${CAPTURE_ONLY:-}" ]; then
  echo "CAPTURE_ONLY set: not comparing."
  exit 0
fi

node "$ROOT/e2e/scripts/compare-screenshots.mjs" \
  --current "$CURRENT" --baseline "$BASELINE" --diff "$SHOTS/diff/$PLATFORM" "$@"
