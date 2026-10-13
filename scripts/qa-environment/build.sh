#!/usr/bin/env bash
#
# Builds the APK start.sh installs, the way the Android end to end workflow does
# (.github/workflows/e2e-android.yml): a release build with the bundle inside, the instance
# address screen (EXPO_PUBLIC_E2E) and plain HTTP to the e2e stack allowed.
#
#   scripts/qa-environment/build.sh    # once, and whenever the code under test changes
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

# The lockfile wants the npm of Node 20 (npm 11 rejects it)
NVM_SH="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$NVM_SH" ]; then
  # shellcheck source=/dev/null
  . "$NVM_SH"
  nvm use 20 >/dev/null
fi
[ -d node_modules ] || npm ci

if command -v ccache >/dev/null; then
  export CMAKE_C_COMPILER_LAUNCHER=ccache CMAKE_CXX_COMPILER_LAUNCHER=ccache \
    CCACHE_COMPILERCHECK=content CCACHE_BASEDIR="$ROOT" CCACHE_NOHASHDIR=true \
    CCACHE_SLOPPINESS=time_macros,include_file_mtime,include_file_ctime,pch_defines
fi
cd android
EXPO_PUBLIC_E2E=1 ./gradlew assembleRelease -PusesCleartextTraffic=true --no-daemon --build-cache \
  -PreactNativeArchitectures=x86_64
echo "==> $ROOT/android/app/build/outputs/apk/release/app-release.apk"
