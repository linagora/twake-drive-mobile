#!/usr/bin/env bash
set -euo pipefail

# Waits for the instance the run signs into, and seeds enough for the flows to
# have something to look at.
#
# Usage: e2e/stack/setup.sh [domain] [passphrase]

DOMAIN="${1:-alice.10-0-2-2.nip.io}"
PASSPHRASE="${2:-cozycozy}"
STACK="${STACK_CONTAINER:-e2e-stack-1}"

run() { docker exec "$STACK" cozy-stack "$@"; }

echo "Waiting for the stack to answer…"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost/version" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://localhost/version" | head -1

# The image creates the instance named by COZY_STACK_HOST on startup; this
# only has to wait for it, and create it when the domain differs.
for _ in $(seq 1 60); do
  run instances show "$DOMAIN" >/dev/null 2>&1 && break
  sleep 2
done
if ! run instances show "$DOMAIN" >/dev/null 2>&1; then
  echo "Creating $DOMAIN"
  run instances add "$DOMAIN" \
    --passphrase "$PASSPHRASE" \
    --locale fr \
    --email e2e@example.com \
    --public-name "E2E"
fi

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
