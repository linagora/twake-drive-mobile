#!/usr/bin/env bash
#
# Stops the iOS QA environment started by start.sh: the ssh tunnel to the Mac, the stack and
# its instance, and the app on the simulator when the QA stack was running. The simulator stays
# booted, with the app installed.
#
#   IOS_HOST=mac-m1 IOS_SIMULATOR=<udid> scripts/qa-environment/ios/stop.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck source=scripts/qa-environment/stack.sh
. "$ROOT/scripts/qa-environment/stack.sh"
QA_PROJECT="${QA_PROJECT:-twake-drive-mobile-qa-ios}"
TUNNEL="${TMPDIR:-/tmp}/$QA_PROJECT-tunnel.sock"

RUNNING="$(docker compose -p "$QA_PROJECT" ps -q 2>/dev/null)"
close_tunnel "$TUNNEL" "${IOS_HOST:-mac}"
docker compose -p "$QA_PROJECT" down --volumes --remove-orphans
if [ -n "$RUNNING" ] && [ -n "${IOS_HOST:-}" ] && [ -n "${IOS_SIMULATOR:-}" ]; then
  # shellcheck disable=SC2029 # the simulator's id is expanded here on purpose
  ssh "$IOS_HOST" "xcrun simctl terminate '$IOS_SIMULATOR' com.linagora.twakedrive" 2>/dev/null
fi
echo "==> QA environment '$QA_PROJECT' stopped"
