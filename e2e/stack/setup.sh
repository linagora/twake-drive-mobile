#!/usr/bin/env bash
set -euo pipefail

# Creates the disposable instance the e2e run signs into, and seeds enough for
# the flows to have something to look at. Idempotent: an existing instance is
# destroyed first, so a re-run starts from the same state.
#
# Usage: e2e/stack/setup.sh [domain] [passphrase]

DOMAIN="${1:-alice.10-0-2-2.nip.io}"
PASSPHRASE="${2:-cozycozy}"
STACK="${STACK_CONTAINER:-e2e-stack-1}"

# The admin API of the stack is behind a passphrase; the same one the
# container was started with.
run() { docker exec -e COZY_ADMIN_PASSPHRASE="${COZY_ADMIN_PASSPHRASE:-cozyadmin}" "$STACK" cozy-stack "$@"; }

# From the runner the stack is on localhost; the nip.io name is what the
# emulator uses, so it travels as a Host header rather than through DNS.
stack_curl() { curl -fsS -H "Host: $DOMAIN" "http://localhost$@"; }

echo "Waiting for the stack to answer…"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost/version" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://localhost/version" | head -1

if run instances show "$DOMAIN" >/dev/null 2>&1; then
  echo "Removing the previous $DOMAIN"
  run instances destroy "$DOMAIN" --force
fi

echo "Creating $DOMAIN"
run instances add "$DOMAIN" \
  --passphrase "$PASSPHRASE" \
  --locale fr \
  --email e2e@example.com \
  --public-name "E2E" \
  --apps drive

echo "Seeding a folder and a file"
TOKEN="$(run instances token-cli "$DOMAIN" io.cozy.files | tr -d '\r\n')"
ROOT="io.cozy.files.root-dir"
curl -fsS -X POST "http://localhost/files/$ROOT?Type=directory&Name=Documents" \
  -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" >/dev/null
printf 'hello from the e2e stack\n' | curl -fsS -X POST \
  "http://localhost/files/$ROOT?Type=file&Name=readme.txt" \
  -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: text/plain' --data-binary @- >/dev/null

echo "Instance ready: http://$DOMAIN"
