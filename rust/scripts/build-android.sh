#!/usr/bin/env bash
#
# Builds the Rust core for Android: a .so per ABI in the jniLibs of the TwakeDriveCore
# module, and its Kotlin bindings. The module's Gradle build runs it; it needs Rust,
# and installs the NDK of the app (react-native's ndkVersion) and cargo-ndk if missing.
#
set -euo pipefail

RUST="$(cd "$(dirname "$0")/.." && pwd)"
MODULE="$RUST/../modules/twake-drive-core/android"
NDK_VERSION=27.1.12297006
CARGO_NDK_VERSION=4.1.2
MIN_SDK=24

# Gradle may run this without the login shell that puts rustup in the PATH.
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
command -v rustup >/dev/null || { echo "Rust is missing: install it with rustup, https://rustup.rs" >&2; exit 1; }
command -v cargo-ndk >/dev/null || cargo install --locked cargo-ndk --version "$CARGO_NDK_VERSION"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
# The NDK Gradle builds the app with, whatever the environment points at.
export ANDROID_NDK_HOME="$SDK/ndk/$NDK_VERSION"
if [ ! -d "$ANDROID_NDK_HOME" ]; then
  "$SDK/cmdline-tools/latest/bin/sdkmanager" --install "ndk;$NDK_VERSION" < <(yes) >/dev/null
fi

cd "$RUST"
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
rm -rf "$MODULE/src/main/jniLibs"
# Every ABI the app ships (reactNativeArchitectures), with pages of 16 KB: Google
# Play requires it for apps targeting Android 15 and up.
RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" cargo ndk \
  -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 -P "$MIN_SDK" \
  -o "$MODULE/src/main/jniLibs" build --release --locked -p twake-drive-core --lib

# The bindings do not depend on the target. The release library is stripped of
# the metadata bindgen reads: generate them from a debug build of the host.
cargo build --locked -p twake-drive-core --lib
HOST_LIB=target/debug/libtwake_drive_core.so
[ -f "$HOST_LIB" ] || HOST_LIB=target/debug/libtwake_drive_core.dylib
rm -rf "$MODULE/src/main/java/com/linagora/twakedrive/core"
cargo run --locked -q -p uniffi-bindgen -- generate --library "$HOST_LIB" \
  --language kotlin --out-dir "$MODULE/src/main/java" --no-format
