#!/usr/bin/env bash
#
# Starts the iOS QA environment: the e2e stack (e2e/stack) here, with a fresh instance named
# 127.0.0.1:$QA_STACK_PORT (iOS lets the app speak plain HTTP to an IP address only), forwarded
# to the Mac $IOS_HOST by an ssh tunnel, then the app of build.sh installed on its simulator
# $IOS_SIMULATOR and signed in by the e2e sign-in flow. The simulator must already be booted:
# this script never boots nor shuts one down.
#
#   IOS_HOST=mac-m1 IOS_SIMULATOR=<udid> IOS_WORKDIR=/Users/m1/twake-qa/twake-drive-mobile \
#     IOS_MAESTRO=maestro scripts/qa-environment/ios/start.sh
#
# Instance: http://127.0.0.1:18080 on the simulator, passphrase cozycozy, in French. The stack
# and the stand-in sign-up portal listen on 127.0.0.1:$QA_STACK_PORT and $QA_PORTAL_PORT here and
# on the Mac, next to the Android QA stack (ports 80 and 8090).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck source=scripts/qa-environment/stack.sh
. "$ROOT/scripts/qa-environment/stack.sh"
: "${IOS_HOST:?}" "${IOS_SIMULATOR:?}" "${IOS_WORKDIR:?}"
QA_PROJECT="${QA_PROJECT:-twake-drive-mobile-qa-ios}"
QA_STACK_PORT="${QA_STACK_PORT:-18080}"
QA_PORTAL_PORT="${QA_PORTAL_PORT:-18090}"
TUNNEL="${TMPDIR:-/tmp}/$QA_PROJECT-tunnel.sock"
DOMAIN="127.0.0.1:$QA_STACK_PORT"
APP="$IOS_WORKDIR/ios/build/Build/Products/Release-iphonesimulator/TwakeDrive.app"

stop_stack_on_failure "$QA_PROJECT" "close_tunnel '$TUNNEL' '$IOS_HOST'"
start_stack "$QA_PROJECT" "$QA_STACK_PORT" "$QA_PORTAL_PORT" "$DOMAIN" "http://127.0.0.1:$QA_PORTAL_PORT"

# The simulator shares the Mac's network: its 127.0.0.1 ports lead here
ssh -M -S "$TUNNEL" -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -R "$QA_STACK_PORT:127.0.0.1:$QA_STACK_PORT" -R "$QA_PORTAL_PORT:127.0.0.1:$QA_PORTAL_PORT" "$IOS_HOST"

# shellcheck disable=SC2087 # expanded here on purpose: the Mac gets the values
ssh "$IOS_HOST" bash -s <<EOF
set -euo pipefail
curl -fsS -H 'Host: $DOMAIN' http://127.0.0.1:$QA_STACK_PORT/version >/dev/null
xcrun simctl bootstatus '$IOS_SIMULATOR' >/dev/null
xcrun simctl install '$IOS_SIMULATOR' '$APP'
${IOS_MAESTRO:-maestro} --platform ios --udid '$IOS_SIMULATOR' test \
  --env INSTANCE_URL='http://$DOMAIN' --env INSTANCE_PASSPHRASE=cozycozy \
  '$IOS_WORKDIR/e2e/maestro/flows/00-login-instance.yaml'
EOF
echo "==> QA environment '$QA_PROJECT' started, the app on $IOS_SIMULATOR is signed into http://$DOMAIN"
