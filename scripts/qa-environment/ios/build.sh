#!/usr/bin/env bash
#
# Builds the simulator app start.sh installs, on the Mac $IOS_HOST (ssh), from a copy of this
# working tree in $IOS_WORKDIR there: a Release build with the instance address screen
# (EXPO_PUBLIC_E2E), like the Android QA build. node_modules and Pods stay on the Mac between
# builds: npm ci runs again when package-lock.json changes, pod install when the Pods no longer
# match ios/Podfile.lock.
#
#   IOS_HOST=mac-m1 IOS_WORKDIR=/Users/m1/twake-qa/twake-drive-mobile scripts/qa-environment/ios/build.sh
#
# IOS_DEVELOPER_DIR: the Xcode to build with (default: the Mac's selected one).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
: "${IOS_HOST:?the Mac, an ssh host}" "${IOS_WORKDIR:?the copy of the working tree on the Mac}"

# shellcheck disable=SC2029 # the Mac's path is expanded here on purpose
ssh "$IOS_HOST" "mkdir -p '$IOS_WORKDIR'"
rsync -az --delete --exclude /.git --exclude /node_modules --exclude /ios/Pods --exclude /ios/build \
  --exclude /android --exclude /.qa-deps "$ROOT/" "$IOS_HOST:$IOS_WORKDIR/"

# shellcheck disable=SC2087 # expanded here on purpose: the Mac gets the values
ssh "$IOS_HOST" bash -s <<EOF
set -euo pipefail
cd '$IOS_WORKDIR'
eval "\$(/opt/homebrew/bin/brew shellenv)"
. "\$HOME/.nvm/nvm.sh"
nvm use 20 >/dev/null
${IOS_DEVELOPER_DIR:+export DEVELOPER_DIR='$IOS_DEVELOPER_DIR'}
NPM="\$(shasum package-lock.json)"
if [ ! -d node_modules ] || [ "\$(cat .qa-deps 2>/dev/null)" != "\$NPM" ]; then
  [ -d .git ] || git init -q # npm's prepare script installs lefthook's git hooks
  # the native modules build against the macOS SDK of that Xcode, not the Command Line Tools'
  SDKROOT="\$(xcrun --sdk macosx --show-sdk-path)" npm ci
  echo "\$NPM" > .qa-deps
  rm -f ios/Pods/Manifest.lock # a new native module needs its pod: install them again below
fi
# Xcode refuses Pods out of sync with Podfile.lock, which the copy above may have just replaced
# (pod install rewrites a Podfile.lock its CocoaPods or the autolinked modules disagree with)
if ! cmp -s ios/Podfile.lock ios/Pods/Manifest.lock; then
  (cd ios && pod install)
fi
EXPO_PUBLIC_E2E=1 xcodebuild -workspace ios/TwakeDrive.xcworkspace -scheme TwakeDrive \
  -configuration Release -sdk iphonesimulator -derivedDataPath ios/build \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES AD_HOC_CODE_SIGNING_ALLOWED=YES \
  build -quiet
echo "==> $IOS_HOST:$IOS_WORKDIR/ios/build/Build/Products/Release-iphonesimulator/TwakeDrive.app"
EOF
