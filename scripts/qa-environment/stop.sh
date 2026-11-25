#!/usr/bin/env bash
#
# Stops the QA environment started by start.sh, deletes its instance, and leaves the emulator
# as a run found it: the app's data cleared, airplane mode off, Maestro's driver stopped, the
# device profile of device-profile.sh reset. The emulator is only reset when the QA stack was
# running: otherwise another run may be using it.
#
#   ANDROID_SERIAL=emulator-5554 scripts/qa-environment/stop.sh
#
set -uo pipefail

# shellcheck source=scripts/qa-environment/device-profile.sh
. "$(cd "$(dirname "$0")" && pwd)/device-profile.sh"

QA_PROJECT="${QA_PROJECT:-twake-drive-mobile-qa}"

RUNNING="$(docker compose -p "$QA_PROJECT" ps -q 2>/dev/null)"
docker compose -p "$QA_PROJECT" down --volumes --remove-orphans
if [ -n "$RUNNING" ] && [ -n "${ANDROID_SERIAL:-}" ] && adb get-state >/dev/null 2>&1; then
  adb shell pm clear com.linagora.twakedrive >/dev/null
  adb shell cmd connectivity airplane-mode disable
  adb shell am force-stop dev.mobile.maestro.test
  adb shell am force-stop dev.mobile.maestro
  adb forward --remove-all
  reset_device_profile
fi
echo "==> QA environment '$QA_PROJECT' stopped"
