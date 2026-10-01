#!/usr/bin/env bash
set -uo pipefail

# Runs the Android flows against the disposable instance, one `maestro test`
# per flow, in a shuffled order: a flow that only passes after another one
# shows up as a failure instead of hiding behind the order.
#
# Usage: e2e/scripts/run-ci-android.sh [flow or directory…]
# Env: INSTANCE_DOMAIN, INSTANCE_PASSPHRASE, STACK_CONTAINER, and optionally
# E2E_SEED to replay an order, REPORTS_DIR for the JUnit reports.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FLOWS_DIR="$ROOT/e2e/maestro/flows"
REPORTS="${REPORTS_DIR:-/tmp/maestro-reports}"
SEED="${E2E_SEED:-$RANDOM}"
SKIPPED_TAGS='login|ci-login|setup|preauth|shipped|visual|ios-files|onlyoffice|skip'

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
  maestro test \
    --env INSTANCE_URL="http://$INSTANCE_DOMAIN" \
    --env INSTANCE_PASSPHRASE="$INSTANCE_PASSPHRASE" \
    --env STACK_URL="http://localhost" \
    --env STACK_HOST="$INSTANCE_DOMAIN" \
    --env STACK_TOKEN="$(token)" \
    --format junit --output "$REPORTS/$name.xml" \
    "$@"
}

if [ "$#" -eq 0 ]; then set -- "$FLOWS_DIR/in-app" "$FLOWS_DIR/android"; fi
FLOWS=()
for target in "$@"; do
  while IFS= read -r flow; do
    if tags_of "$flow" | grep -qxE "$SKIPPED_TAGS"; then continue; fi
    FLOWS+=("$flow")
  done < <(if [ -d "$target" ]; then find "$target" -name '*.yaml' | sort; else echo "$target"; fi)
done

adb shell mkdir -p /sdcard/Download
adb push "$ROOT/e2e/fixtures/sample.jpg" /sdcard/Download/e2e-share.jpg >/dev/null
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/e2e-share.jpg >/dev/null

PASSED=()
FAILED=()

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
  adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  if run "$name" "$flow"; then PASSED+=("$name"); else FAILED+=("$name"); fi
  echo "::endgroup::"
done

{
  echo "### E2E Android: ${#PASSED[@]} passed, ${#FAILED[@]} failed"
  echo
  echo "Order seed \`$SEED\`."
  echo
  echo "| Flow | Result |"
  echo "|---|---|"
  for name in ${PASSED[@]+"${PASSED[@]}"}; do echo "| $name | ✅ |"; done
  for name in ${FAILED[@]+"${FAILED[@]}"}; do echo "| $name | ❌ |"; done
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

[ "${#FAILED[@]}" -eq 0 ]
