#!/usr/bin/env bash
#
# Builds the Rust core for iOS: a static XCFramework (device + simulator) and its Swift
# bindings, in modules/twake-drive-core/ios/generated, which the TwakeDriveCore pod vendors.
# Run it on a Mac before `pod install`, and again after changing rust/.
#
set -euo pipefail

RUST="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$RUST/../modules/twake-drive-core/ios/generated"
LIB=libtwake_drive_core.a
FFI=twake_drive_coreFFI
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)

command -v rustup >/dev/null || { echo "Rust is missing: install it with rustup, https://rustup.rs" >&2; exit 1; }

cd "$RUST"
export IPHONEOS_DEPLOYMENT_TARGET=16.0
rustup target add "${TARGETS[@]}"
for target in "${TARGETS[@]}"; do
  cargo build --release --locked -p twake-drive-core --lib --target "$target"
done

rm -rf "$OUT"
mkdir -p "$OUT/sim" "$OUT/headers/$FFI"
cargo run --locked -q -p uniffi-bindgen -- generate --library "target/aarch64-apple-ios/release/$LIB" \
  --language swift --out-dir "$OUT/bindings"
mv "$OUT/bindings/"*.swift "$OUT/"
mv "$OUT/bindings/$FFI.h" "$OUT/headers/$FFI/"
# A subfolder per module: Xcode merges the headers of every XCFramework, so a
# top-level module.modulemap would collide with another library's.
mv "$OUT/bindings/$FFI.modulemap" "$OUT/headers/$FFI/module.modulemap"
rmdir "$OUT/bindings"

lipo -create "target/aarch64-apple-ios-sim/release/$LIB" "target/x86_64-apple-ios/release/$LIB" \
  -output "$OUT/sim/$LIB"
xcodebuild -create-xcframework \
  -library "target/aarch64-apple-ios/release/$LIB" -headers "$OUT/headers" \
  -library "$OUT/sim/$LIB" -headers "$OUT/headers" \
  -output "$OUT/TwakeDriveCoreFFI.xcframework"
rm -rf "$OUT/sim" "$OUT/headers"
