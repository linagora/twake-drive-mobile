#!/usr/bin/env bash
set -uo pipefail

# Runs the flows against the disposable instance, one `maestro test` per flow,
# in a shuffled order: a flow that only passes after another one shows up as a
# failure instead of hiding behind the order.
#
# Usage: e2e/scripts/run-flows.sh [flow or directory…]
# Env: INSTANCE_DOMAIN, INSTANCE_PASSPHRASE, STACK_CONTAINER, and optionally
# PLATFORM (android by default, or ios), MAESTRO_DEVICE (a udid), E2E_SEED to
# replay an order, REPORTS_DIR for the JUnit reports, MAESTRO_ENV for extra
# `-e NAME=value` pairs, FLOW_TIMEOUT for the seconds a single flow may take
# before it is killed.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FLOWS_DIR="$ROOT/e2e/maestro/flows"
REPORTS="${REPORTS_DIR:-/tmp/maestro-reports}"
SEED="${E2E_SEED:-$RANDOM}"
PLATFORM="${PLATFORM:-android}"
# Seconds a single flow may take before it is killed. The longest honest flow
# today is the sign-in at a bit over two minutes, so this leaves ample room
# while staying far under the job's own cap.
FLOW_TIMEOUT="${FLOW_TIMEOUT:-480}"
SKIPPED_TAGS='login|ci-login|setup|preauth|shipped|visual|ios-files|onlyoffice|skip'
# airplane mode and DocumentsUI only exist on Android
[ "$PLATFORM" = ios ] && SKIPPED_TAGS="$SKIPPED_TAGS|android"
DEVICE_ARGS=(--platform "$PLATFORM")
[ -n "${MAESTRO_DEVICE:-}" ] && DEVICE_ARGS+=(--udid "$MAESTRO_DEVICE")

mkdir -p "$REPORTS"

token() {
  docker exec "$STACK_CONTAINER" cozy-stack instances token-cli "$INSTANCE_DOMAIN" io.cozy.files |
    tr -d '\r\n'
}

tags_of() {
  sed -n '/^---/q; /^tags:/,/^[^ ]/p' "$1" | sed -n 's/^ *- *//p'
}

# Maestro can wedge before it runs a single command: it picks the device, then
# never starts the flow and never returns. Unbounded, one such flow eats the
# rest of the job's budget and the run is killed by the job's own cap, which
# leaves no report, no summary and no recording check — the whole suite is lost
# to one hung flow. Bounding each flow turns that into a single failure.
TIMEOUT_CMD=()
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout --kill-after=30 "$FLOW_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout --kill-after=30 "$FLOW_TIMEOUT")
else
  # macOS carries neither; perl is always there. SIGALRM survives the exec, so
  # the budget applies to maestro itself.
  TIMEOUT_CMD=(perl -e 'alarm shift @ARGV; exec @ARGV' "$FLOW_TIMEOUT")
fi

# `timeout` answers 124, perl's SIGALRM leaves 142. Either way the flow was cut
# off rather than having failed on an assertion, which is worth telling apart in
# the summary: a hang is a different bug from a broken expectation.
timed_out() {
  [ "$1" -eq 124 ] || [ "$1" -eq 142 ] || [ "$1" -eq 137 ]
}

run() {
  local name="$1"
  shift
  # shellcheck disable=SC2086
  "${TIMEOUT_CMD[@]}" "$ROOT/e2e/scripts/maestro.sh" "${DEVICE_ARGS[@]}" test ${MAESTRO_ENV:-} \
    --env INSTANCE_URL="http://$INSTANCE_DOMAIN" \
    --env INSTANCE_PASSPHRASE="$INSTANCE_PASSPHRASE" \
    --env STACK_URL="http://localhost" \
    --env STACK_HOST="$INSTANCE_DOMAIN" \
    --env STACK_TOKEN="$(token)" \
    --format junit --output "$REPORTS/$name.xml" \
    "$@"
  local status=$?
  if timed_out "$status"; then
    TIMED_OUT+=("$name")
    echo "::error::$name was still running after ${FLOW_TIMEOUT}s and was killed."
  fi
  return "$status"
}

if [ "$#" -eq 0 ]; then
  set -- "$FLOWS_DIR/in-app"
  [ "$PLATFORM" = android ] && set -- "$@" "$FLOWS_DIR/android"
fi
FLOWS=()
for target in "$@"; do
  while IFS= read -r flow; do
    if tags_of "$flow" | grep -qxE "$SKIPPED_TAGS"; then continue; fi
    FLOWS+=("$flow")
  done < <(if [ -d "$target" ]; then find "$target" -name '*.yaml' | sort; else echo "$target"; fi)
done

if [ "$PLATFORM" = android ]; then
  adb shell mkdir -p /sdcard/Download
  adb push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Download/e2e-share.jpg >/dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d file:///sdcard/Download/e2e-share.jpg >/dev/null
fi

PASSED=()
FAILED=()
TIMED_OUT=()

echo "::group::00-welcome"
if run 00-welcome "$FLOWS_DIR/00-welcome.yaml"; then PASSED+=(00-welcome); else FAILED+=(00-welcome); fi
echo "::endgroup::"

echo "::group::Setup: sign in"
if ! run 00-login-instance "$FLOWS_DIR/00-login-instance.yaml"; then
  echo "::endgroup::"
  echo "::error::Setup failed: no flow can run without a session."
  exit 1
fi
echo "::endgroup::"

echo "Order seed: $SEED (E2E_SEED=$SEED replays this order)"
ORDERED=()
while IFS= read -r flow; do ORDERED+=("$flow"); done < <(
  printf '%s\n' "${FLOWS[@]}" | awk -v seed="$SEED" 'BEGIN { srand(seed) } { print rand() "\t" $0 }' |
    sort -k1,1 | cut -f2-
)

for flow in "${ORDERED[@]}"; do
  name="$(basename "$flow" .yaml)"
  echo "::group::$name"
  [ "$PLATFORM" = android ] && adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1
  if run "$name" "$flow"; then PASSED+=("$name"); else FAILED+=("$name"); fi
  echo "::endgroup::"
done

was_timed_out() {
  local name="$1" other
  for other in ${TIMED_OUT[@]+"${TIMED_OUT[@]}"}; do
    [ "$other" = "$name" ] && return 0
  done
  return 1
}

{
  echo -n "### E2E $PLATFORM: ${#PASSED[@]} passed, ${#FAILED[@]} failed"
  [ "${#TIMED_OUT[@]}" -eq 0 ] || echo -n " (${#TIMED_OUT[@]} timed out)"
  echo
  echo
  echo "Order seed \`$SEED\`."
  echo
  echo "| Flow | Result |"
  echo "|---|---|"
  for name in ${PASSED[@]+"${PASSED[@]}"}; do echo "| $name | ✅ |"; done
  for name in ${FAILED[@]+"${FAILED[@]}"}; do
    if was_timed_out "$name"; then
      echo "| $name | ⏱ killed after ${FLOW_TIMEOUT}s |"
    else
      echo "| $name | ❌ |"
    fi
  done
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

[ "${#FAILED[@]}" -eq 0 ]
