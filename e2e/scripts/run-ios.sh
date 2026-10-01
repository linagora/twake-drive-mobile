#!/usr/bin/env bash
set -euo pipefail
# Local E2E on the iOS simulator (in-app flows only: no native File Provider /
# Share extension). Prerequisite: the app installed, built with the instance
# address screen (EXPO_PUBLIC_E2E, or a development build).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM="${SIMULATOR:-booted}"

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || xcrun simctl boot "$SIM" || true

if [ -n "${APP_PATH:-}" ]; then
  echo "Installing $APP_PATH on the simulator…"
  xcrun simctl install "$SIM" "$APP_PATH"
fi

# Against the local e2e stack (docs/e2e-testing.md): the instance is named
# 127.0.0.1, the only plain-HTTP host iOS lets the app reach. Signs in, then
# runs every flow on its own, like CI (run-flows.sh).
PLATFORM=ios \
  MAESTRO_DEVICE="${MAESTRO_DEVICE:-}" \
  INSTANCE_DOMAIN="${INSTANCE_DOMAIN:-127.0.0.1}" \
  INSTANCE_PASSPHRASE="${INSTANCE_PASSPHRASE:-cozycozy}" \
  STACK_CONTAINER="${STACK_CONTAINER:-$(docker ps -qf name=stack-stack | head -1)}" \
  "$ROOT/e2e/scripts/run-flows.sh" "$@"
