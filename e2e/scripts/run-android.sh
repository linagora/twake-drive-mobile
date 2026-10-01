#!/usr/bin/env bash
set -euo pipefail
# Local E2E on an Android device (adb), against the e2e stack: the flows seed
# what they act on through it. Signs in, then runs every flow on its own, like
# CI (run-flows.sh). Never uninstalls.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

DEVICE="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
[ -z "${DEVICE:-}" ] && { echo "No adb device connected."; exit 1; }
echo "Device: $DEVICE"

# Optional (re)install without wiping data (-r keeps the session)
if [ -n "${APK_PATH:-}" ]; then
  echo "Installing $APK_PATH (data preserved)…"
  adb -s "$DEVICE" install -r "$APK_PATH"
fi

INSTANCE_DOMAIN="${INSTANCE_DOMAIN:-alice.10-0-2-2.nip.io}" \
  INSTANCE_PASSPHRASE="${INSTANCE_PASSPHRASE:-cozycozy}" \
  STACK_CONTAINER="${STACK_CONTAINER:-$(docker ps -qf name=stack | head -1)}" \
  "$ROOT/e2e/scripts/run-flows.sh" "$@"
