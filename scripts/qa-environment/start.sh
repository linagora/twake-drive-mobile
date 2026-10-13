#!/usr/bin/env bash
#
# Starts the QA environment of the Android app: the e2e stack (e2e/stack), a fresh instance
# seeded by its setup.sh, then the APK of build.sh installed on the emulator $ANDROID_SERIAL
# with its data cleared and signed into the instance by the e2e sign-in flow. The emulator must
# already be running: this script never starts one.
#
#   ANDROID_SERIAL=emulator-5554 scripts/qa-environment/start.sh
#
# Instance: http://alice.10-0-2-2.nip.io (the emulator reaches the host through 10.0.2.2),
# passphrase cozycozy, in French. Its stack and the stand-in sign-up portal listen on
# 127.0.0.1:80 and 127.0.0.1:8090 only: one Android QA or e2e stack per machine.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/qa-environment/stack.sh
. "$ROOT/scripts/qa-environment/stack.sh"
QA_PROJECT="${QA_PROJECT:-twake-drive-mobile-qa}"
DOMAIN=alice.10-0-2-2.nip.io
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
export ANDROID_SERIAL="${ANDROID_SERIAL:?the emulator under test, e.g. emulator-5554}"

command -v adb >/dev/null || { echo "adb is not on the PATH (Android SDK platform-tools)" >&2; exit 1; }
[ -f "$APK" ] || { echo "No APK: run scripts/qa-environment/build.sh first" >&2; exit 1; }
[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] ||
  { echo "$ANDROID_SERIAL is not a booted device" >&2; exit 1; }

stop_stack_on_failure "$QA_PROJECT"
start_stack "$QA_PROJECT" 80 8090 "$DOMAIN" http://10.0.2.2:8090

adb install -r "$APK"
adb shell pm clear com.linagora.twakedrive
# The picture the share and upload flows send, in Downloads
adb shell mkdir -p /sdcard/Download
adb push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Download/e2e-share.jpg >/dev/null
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/e2e-share.jpg >/dev/null

"$ROOT/e2e/scripts/maestro.sh" --platform android --udid "$ANDROID_SERIAL" test \
  --env INSTANCE_URL="http://$DOMAIN" --env INSTANCE_PASSPHRASE=cozycozy \
  "$ROOT/e2e/maestro/flows/00-login-instance.yaml"
echo "==> QA environment '$QA_PROJECT' started, the app on $ANDROID_SERIAL is signed into http://$DOMAIN"
