#!/usr/bin/env bash
set -euo pipefail
# Maestro wrapper: injects JDK 17 (Maestro requires it, the system Java is
# often 11) and puts ~/.maestro/bin on the PATH. Passes all arguments through
# to the Maestro CLI.
#   ./e2e/scripts/maestro.sh test e2e/maestro/flows
#   ./e2e/scripts/maestro.sh hierarchy
# Prerequisite: ./e2e/scripts/setup-ios-automation.sh

# java_home answers the closest version it has rather than failing, so a
# machine with Java 11 alone answers Java 11 to a request for 17. The version
# is read back before the home is trusted.
is_17_plus() {
  [ -x "$1/bin/java" ] || return 1
  "$1/bin/java" -version 2>&1 | head -1 | grep -qE '"(1[7-9]|[2-9][0-9])'
}

JDK_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
is_17_plus "$JDK_HOME" || JDK_HOME=/opt/homebrew/opt/openjdk@17
is_17_plus "$JDK_HOME" || JDK_HOME=""
[ -n "$JDK_HOME" ] && export JAVA_HOME="$JDK_HOME" && export PATH="$JAVA_HOME/bin:$PATH"
export PATH="$HOME/.maestro/bin:$PATH"

# A runner that already carries a usable Java and Maestro needs neither of the
# two above; only a workstation with the wrong default Java does.
command -v maestro >/dev/null \
  || { echo "Maestro not found. Run ./e2e/scripts/setup-ios-automation.sh" >&2; exit 1; }
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
exec maestro "$@"
