#!/usr/bin/env bash
# Build Android APK and iOS archive from the Capacitor project.
#
# Usage:
#   ./scripts/build-mobile.sh [options]
#
# Options:
#   --android-only   Skip iOS build
#   --ios-only       Skip Android build
#   --debug          Build debug variants instead of release
#   --skip-web       Skip the tsc + vite build + cap sync step (use existing dist/)
#
# Output:
#   Android release: frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk
#   Android debug:   frontend/android/app/build/outputs/apk/debug/app-debug.apk
#   iOS:             frontend/ios/App/App.xcarchive  (open in Xcode Organizer to export .ipa)
#
# iOS builds require macOS. On any other OS the iOS step is skipped automatically.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend"
ANDROID="$FRONTEND/android"
IOS="$FRONTEND/ios/App"

BUILD_ANDROID=true
BUILD_IOS=true
BUILD_TYPE=release
SKIP_WEB=false

for arg in "$@"; do
  case $arg in
    --android-only) BUILD_IOS=false ;;
    --ios-only)     BUILD_ANDROID=false ;;
    --debug)        BUILD_TYPE=debug ;;
    --skip-web)     SKIP_WEB=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ── Web bundle ──────────────────────────────────────────────────────────────
if ! $SKIP_WEB; then
  echo "==> Building web bundle and syncing Capacitor..."
  cd "$FRONTEND"
  npm run build
  npx cap sync
fi

# ── Android ──────────────────────────────────────────────────────────────────
if $BUILD_ANDROID; then
  echo ""
  echo "==> Building Android ($BUILD_TYPE)..."
  cd "$ANDROID"

  if [[ "$BUILD_TYPE" == "debug" ]]; then
    ./gradlew assembleDebug
    APK="$ANDROID/app/build/outputs/apk/debug/app-debug.apk"
  else
    ./gradlew assembleRelease
    # Gradle produces unsigned when no signingConfig is set
    UNSIGNED="$ANDROID/app/build/outputs/apk/release/app-release-unsigned.apk"
    SIGNED="$ANDROID/app/build/outputs/apk/release/app-release.apk"
    APK=$([[ -f "$UNSIGNED" ]] && echo "$UNSIGNED" || echo "$SIGNED")
  fi

  echo ""
  echo "Android build complete."
  echo "  APK: $APK"
fi

# ── iOS (macOS only) ─────────────────────────────────────────────────────────
if $BUILD_IOS; then
  if [[ "$(uname)" != "Darwin" ]]; then
    echo ""
    echo "==> Skipping iOS (requires macOS — run this script on a Mac)."
  else
    echo ""
    echo "==> Building iOS ($BUILD_TYPE)..."
    cd "$IOS"

    XCCONFIG=$([[ "$BUILD_TYPE" == "debug" ]] && echo "Debug" || echo "Release")
    ARCHIVE="$IOS/App.xcarchive"

    xcodebuild \
      -workspace App.xcworkspace \
      -scheme App \
      -configuration "$XCCONFIG" \
      -destination "generic/platform=iOS" \
      -archivePath "$ARCHIVE" \
      archive \
      | xcpretty 2>/dev/null || cat  # xcpretty is optional; falls back to raw output

    echo ""
    echo "iOS build complete."
    echo "  Archive: $ARCHIVE"
    echo "  To export an .ipa: open the archive in Xcode Organizer (Product → Archives)"
    echo "  or run: xcodebuild -exportArchive -archivePath \"$ARCHIVE\" -exportPath <dir> -exportOptionsPlist <plist>"
  fi
fi
