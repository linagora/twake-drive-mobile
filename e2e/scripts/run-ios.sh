#!/usr/bin/env bash
set -euo pipefail
# Local E2E smoke on the iOS simulator (in-app only: no native File Provider /
# Share extension). Prerequisite: app installed. With INSTANCE_URL set, the run
# signs into that instance first (00-login-instance); without it, the app must
# already be logged in. Against the local e2e stack: INSTANCE_URL=http://127.0.0.1
# (see docs/e2e-testing.md).
# The tag list is spelled out here because a --exclude-tags on the command line
# replaces the one config.yaml declares rather than adding to it.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

if [ -n "${APP_PATH:-}" ]; then
  echo "Installing $APP_PATH on the simulator…"
  xcrun simctl install "$SIM" "$APP_PATH"
fi

if [ -n "${INSTANCE_URL:-}" ]; then
  maestro --platform ios test "$ROOT/e2e/maestro/flows/00-login-instance.yaml" \
    -e INSTANCE_URL="$INSTANCE_URL" \
    -e INSTANCE_PASSPHRASE="${INSTANCE_PASSPHRASE:-cozycozy}"
fi

# The flows seed what they act on through the stack (e2e/maestro/scripts/seed.js).
DOMAIN="${INSTANCE_URL:-http://127.0.0.1}"
DOMAIN="${DOMAIN#*://}"
STACK="${STACK_CONTAINER:-$(docker ps -qf name=stack | head -1)}"
TOKEN="$(docker exec "$STACK" cozy-stack instances token-cli "$DOMAIN" io.cozy.files | tr -d '\r\n')"

# On iOS, XCUITest exposes a row's menu button under three ids
# (folder-actions:<name>, -container, -container-outer-layer); the bare id is
# ambiguous, so target the outer layer. Android's resource-id is unique (suffix
# stays empty). Flows read ${MENU_SUFFIX} for the folder-actions selector.
maestro --platform ios test "$ROOT/e2e/maestro/flows" \
  --include-tags inapp \
  --exclude-tags login,disposable,onlyoffice \
  -e MENU_SUFFIX=-container-outer-layer \
  -e STACK_URL=http://localhost \
  -e STACK_HOST="$DOMAIN" \
  -e STACK_TOKEN="$TOKEN"
