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

# The flags twake-drive's own e2e run provisions every instance with, from its
# e2e/helpers/flags.ts. drive.shared-drive.enabled and
# drive.federated-shared-folder.enabled are the two the app reads to share by
# email through a shared drive; the rest is kept as the web sets it so both
# clients face the same instance.
# The image creates the instance in English, the app follows the instance
# locale, and every flow selects on the French labels.
echo "Setting the instance locale"
run instances modify "$DOMAIN" --locale fr

echo "Setting the feature flags"
run features flags --domain "$DOMAIN" '{
  "cozy.hide-sharing-cozy-to-cozy": true,
  "drive.shared-drive.enabled": true,
  "drive.federated-shared-folder.enabled": true,
  "drive.federated-shared-modal.enabled": true,
  "drive.file-picker-demo.enabled": true,
  "cozy.search.enabled": true,
  "dataproxy.force-trusted-device.enabled": true,
  "drive.move-to-picker.enabled": true,
  "drive.default-updated-at-sort.enabled": true
}'

echo "Seeding a folder and a file"
TOKEN="$(run instances token-cli "$DOMAIN" io.cozy.files | tr -d '\r\n')"
ROOT="io.cozy.files.root-dir"
curl -fsS -X POST "http://localhost/files/$ROOT?Type=directory&Name=Documents" \
  -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" >/dev/null
printf 'hello from the e2e stack\n' | curl -fsS -X POST \
  "http://localhost/files/$ROOT?Type=file&Name=readme.txt" \
  -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: text/plain' --data-binary @- >/dev/null

# A handful of documents replicate in a blink, and a replica that is already
# settled hides everything a busy sync does to the screens. Seed enough that a
# run always has one running: 12 folders of 25 files.
echo "Seeding a busy instance"
for d in $(seq 1 12); do
  DIR_ID="$(curl -fsS -X POST "http://localhost/files/$ROOT?Type=directory&Name=Dossier-$d" \
    -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" |
    sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)"
  for f in $(seq 1 25); do
    printf 'e2e seed %s/%s\n' "$d" "$f" | curl -fsS -X POST \
      "http://localhost/files/$DIR_ID?Type=file&Name=fichier-$f.txt" \
      -H "Host: $DOMAIN" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: text/plain' --data-binary @- >/dev/null
  done
done

echo "Instance ready: http://$DOMAIN"
