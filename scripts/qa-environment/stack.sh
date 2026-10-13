# shellcheck shell=bash
# Sourced by start.sh and ios/start.sh: the e2e stack (e2e/stack) of a QA environment, a fresh
# instance seeded by its setup.sh, its ports published on 127.0.0.1 only.

# start_stack <compose project> <stack port> <portal port> <instance domain> <portal URL as the device sees it>
start_stack() {
  local project="$1" stack_port="$2" portal_port="$3" domain="$4" portal_url="$5"
  local root version override container
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  # `!override` needs Compose 2.24.4: an older one would publish the stack's ports on every interface
  version="$(docker compose version --short)"
  printf '%s\n' 2.24.4 "${version#v}" | sort -V -C ||
    { echo "Docker Compose ${version}: 2.24.4 or later needed" >&2; return 1; }
  override="$(mktemp)"
  cat >"$override" <<EOF
services:
  stack:
    ports: !override
      - 127.0.0.1:$stack_port:8080
  portal:
    ports: !override
      - 127.0.0.1:$portal_port:8090
EOF
  docker compose -p "$project" -f "$root/e2e/stack/docker-compose.yml" -f "$override" up -d
  container="$(docker compose -p "$project" ps -q stack)"
  rm -f "$override"
  # setup.sh would otherwise fall back to another stack's container
  [ -n "$container" ] || { echo "No stack container in the compose project $project" >&2; return 1; }
  STACK_CONTAINER="$container" STACK_URL="http://localhost:$stack_port" PORTAL_URL="$portal_url" \
    "$root/e2e/stack/setup.sh" "$domain" cozycozy
}

# The stack goes down again when start.sh fails after starting it, after the optional cleanup
# command given second
stop_stack_on_failure() {
  local project="$1" cleanup="${2:-true}"
  # shellcheck disable=SC2064 # the project and the command are known now
  trap "[ \$? = 0 ] || { $cleanup; docker compose -p '$project' down --volumes --remove-orphans >/dev/null 2>&1; }" EXIT
}

# close_tunnel <control socket> <ssh host>: the ssh tunnel of ios/start.sh, even when its control
# socket no longer answers
close_tunnel() {
  [ -S "$1" ] && ssh -S "$1" -O exit "$2" 2>/dev/null
  pkill -f -- "-S $1" 2>/dev/null
  rm -f "$1"
}
