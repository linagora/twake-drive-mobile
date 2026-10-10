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
# `-e NAME=value` pairs, E2E_FLOW_TIMEOUT for the deadline of one flow
# (12m by default, any `timeout` duration).

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FLOWS_DIR="$ROOT/e2e/maestro/flows"
REPORTS="${REPORTS_DIR:-/tmp/maestro-reports}"
SEED="${E2E_SEED:-$RANDOM}"
PLATFORM="${PLATFORM:-android}"
FLOW_TIMEOUT="${E2E_FLOW_TIMEOUT:-12m}"
# macOS has no `timeout`; Homebrew coreutils installs it as `gtimeout`.
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"
[ -n "$TIMEOUT_BIN" ] || echo "::warning::no timeout/gtimeout found, flows run without a deadline"
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

run() {
  local name="$1"
  shift
  # A frozen flow prints nothing until the job timeout, so each one has a
  # deadline. `timeout` signals its whole process group: maestro's JVM goes too.
  # shellcheck disable=SC2086
  ${TIMEOUT_BIN:+"$TIMEOUT_BIN" --kill-after=30 "$FLOW_TIMEOUT"} "$ROOT/e2e/scripts/maestro.sh" "${DEVICE_ARGS[@]}" test ${MAESTRO_ENV:-} \
    --env INSTANCE_URL="http://$INSTANCE_DOMAIN" \
    --env INSTANCE_PASSPHRASE="$INSTANCE_PASSPHRASE" \
    --env STACK_URL="http://localhost" \
    --env STACK_HOST="$INSTANCE_DOMAIN" \
    --env STACK_TOKEN="$(token)" \
    --format junit --output "$REPORTS/$name.xml" \
    "$@"
}

# Only a timeout is retried (once): a failed assertion is a real failure.
# Exit codes are 124 (TERM) and 137 (KILL after the grace period).
is_timeout() { [ "$1" -eq 124 ] || [ "$1" -eq 137 ]; }

# A killed maestro writes no report. The first timeout is a <skipped> testcase
# (visible, but a pass on retry stays green); the second is a <failure>.
record_timeout() {
  local file="$1" name="$2" label="$3" element="$4"
  cat >"$REPORTS/$file.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="Test Suite" tests="1"><testcase id="$label" name="$label" classname="$name"><$element message="timed out after $FLOW_TIMEOUT"/></testcase></testsuite></testsuites>
EOF
}

# Sets RESULT to passed, retried (passed on retry), failed or hung (timed out twice).
run_with_retry() {
  local name="$1" rc=0
  run "$@" || rc=$?
  if ! is_timeout "$rc"; then
    if [ "$rc" -eq 0 ]; then RESULT=passed; else RESULT=failed; fi
    return
  fi
  record_timeout "$name.attempt1" "$name" "$name (attempt 1, timed out)" skipped
  echo "[Retried] $name (timed out after $FLOW_TIMEOUT)"
  echo "::warning::$name timed out after $FLOW_TIMEOUT, retrying once"
  if [ "$PLATFORM" = android ]; then
    adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1
    adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1
  fi
  rc=0
  run "$@" || rc=$?
  if [ "$rc" -eq 0 ]; then
    RESULT=retried
  elif is_timeout "$rc"; then
    record_timeout "$name" "$name" "$name (timed out twice)" failure
    echo "[Timed out twice] $name"
    RESULT=hung
  else
    RESULT=failed
  fi
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
RETRIED=()
HUNG=()

settle() {
  run_with_retry "$@"
  case "$RESULT" in
    passed) PASSED+=("$1") ;;
    retried) RETRIED+=("$1") ;;
    hung) HUNG+=("$1") ;;
    *) FAILED+=("$1") ;;
  esac
}

echo "::group::00-welcome"
settle 00-welcome "$FLOWS_DIR/00-welcome.yaml"
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
  settle "$name" "$flow"
  echo "::endgroup::"
done

{
  echo "### E2E $PLATFORM: $((${#PASSED[@]} + ${#RETRIED[@]})) passed (${#RETRIED[@]} on retry), $((${#FAILED[@]} + ${#HUNG[@]})) failed"
  echo
  echo "Order seed \`$SEED\`."
  echo
  echo "| Flow | Result |"
  echo "|---|---|"
  for name in ${PASSED[@]+"${PASSED[@]}"}; do echo "| $name | ✅ |"; done
  for name in ${RETRIED[@]+"${RETRIED[@]}"}; do echo "| $name | 🔁 passed on retry (timed out after $FLOW_TIMEOUT) |"; done
  for name in ${FAILED[@]+"${FAILED[@]}"}; do echo "| $name | ❌ |"; done
  for name in ${HUNG[@]+"${HUNG[@]}"}; do echo "| $name | ❌ timed out twice (after $FLOW_TIMEOUT) |"; done
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

[ "$((${#FAILED[@]} + ${#HUNG[@]}))" -eq 0 ]
