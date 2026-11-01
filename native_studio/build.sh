#!/bin/bash
# ==============================================================================
# VOO Design Native — Production Build & Packaging Script
# Pure Swift 6 + AppKit + CoreGraphics + Metal (Zero Third-Party Dependencies)
# ==============================================================================
set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_NAME="VOO Design Native"
BUILD_DIR="$DIR/build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "============================================================"
echo " Building: $APP_NAME (Pure Native macOS AppKit + Metal)"
echo " Workspace: $DIR"
echo "============================================================"

# 1. Clean previous build artifact
rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 2. Gather all Swift source files
SOURCES=$(find "$DIR/Sources" -name "*.swift")
SOURCE_COUNT=$(echo "$SOURCES" | grep -v '^$' | wc -l | tr -d ' ')

if [ "$SOURCE_COUNT" -eq 0 ]; then
  echo "[-] Error: No Swift sources found in $DIR/Sources" >&2
  exit 1
fi
echo "--> Found $SOURCE_COUNT Swift source files."

# 3. Locate macOS SDK
SDK_PATH="$(xcrun --show-sdk-path)"
echo "--> Using macOS SDK: $SDK_PATH"

# 4. Compile Mach-O 64-bit arm64 Binary via swiftc
echo "--> Compiling with swiftc (-Osize, arm64-apple-macosx14.0)..."
mkdir -p "$BUILD_DIR/ModuleCache"
swiftc \
  -Osize \
  -Xlinker -dead_strip \
  -module-cache-path "$BUILD_DIR/ModuleCache" \
  -target arm64-apple-macosx14.0 \
  -sdk "$SDK_PATH" \
  -framework AppKit \
  -framework CoreGraphics \
  -framework CoreImage \
  -framework Metal \
  -framework MetalKit \
  -framework Foundation \
  -framework QuartzCore \
  -parse-as-library \
  $SOURCES \
  -o "$MACOS_DIR/$APP_NAME"

echo "--> Binary compiled successfully: $MACOS_DIR/$APP_NAME"

# 5. Inject Application Icons & Vector Assets
VOO_PARENT_ICON="/Users/tt/teamwork_projects/voo_design/build/icon.icns"
LOCAL_APP_ICON="$DIR/Resources/AppIcon.icns"
LOCAL_ICON="$DIR/Resources/icon.icns"

if [ -f "$LOCAL_APP_ICON" ]; then
  echo "--> Copying local AppIcon.icns..."
  cp "$LOCAL_APP_ICON" "$RESOURCES_DIR/AppIcon.icns"
elif [ -f "$LOCAL_ICON" ]; then
  echo "--> Copying local icon.icns..."
  cp "$LOCAL_ICON" "$RESOURCES_DIR/AppIcon.icns"
elif [ -f "$VOO_PARENT_ICON" ]; then
  echo "--> Copying icon from parent build..."
  cp "$VOO_PARENT_ICON" "$RESOURCES_DIR/AppIcon.icns"
fi

if [ -d "$DIR/Resources/Icons" ]; then
  echo "--> Copying UI tool icons..."
  cp -r "$DIR/Resources/Icons" "$RESOURCES_DIR/Icons"
fi

# Onboarding guide artwork (cover.png / cover-logo.svg), copied when present
if [ -d "$DIR/Resources/Onboarding" ]; then
  echo "--> Copying onboarding guide assets..."
  cp -r "$DIR/Resources/Onboarding" "$RESOURCES_DIR/Onboarding"
fi

# Bundled OFL typefaces: Intel One Mono (editor chrome, the web's `--font-mono`),
# Inter (web default text face) and the remaining text faces the web build ships
# (Archivo Black, Bitter, Caveat, Playfair Display, ZCOOL KuaiLe) + their licenses.
# Copied wholesale; VooMonoTypeface.registerBundledFonts() registers every .ttf.
if [ -d "$DIR/Resources/Fonts" ]; then
  echo "--> Copying bundled fonts (Intel One Mono, Inter, Archivo Black, Bitter, Caveat, Playfair Display, ZCOOL KuaiLe)..."
  cp -r "$DIR/Resources/Fonts" "$RESOURCES_DIR/Fonts"
fi

# 6. Install Info.plist
if [ -f "$DIR/Info.plist" ]; then
  cp "$DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
elif [ -f "$DIR/Resources/Info.plist" ]; then
  cp "$DIR/Resources/Info.plist" "$CONTENTS_DIR/Info.plist"
else
  echo "[-] Error: Info.plist not found in $DIR or $DIR/Resources" >&2
  exit 1
fi

plutil -lint "$CONTENTS_DIR/Info.plist" > /dev/null
echo "--> Info.plist verified via plutil."

# 7. Write PkgInfo (Standard 8-byte signature: APPL????)
echo -n "APPL????" > "$CONTENTS_DIR/PkgInfo"

# 8. Ad-hoc Code Signing for macOS arm64 Bundle Integrity
echo "--> Applying ad-hoc codesign to bundle..."
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --deep --strict "$APP_BUNDLE"
echo "--> Codesign verified."

# 9. Automated Metric Verification Gates
BIN_SIZE=$(stat -f%z "$MACOS_DIR/$APP_NAME")
BIN_SIZE_MB=$(echo "scale=2; $BIN_SIZE / 1048576" | bc)
BUNDLE_SIZE_KB=$(du -sk "$APP_BUNDLE" | awk '{print $1}')
BUNDLE_SIZE_MB=$(echo "scale=2; $BUNDLE_SIZE_KB / 1024" | bc)

echo "============================================================"
echo " BUILD VERIFICATION SUMMARY"
echo "============================================================"
echo " Output Bundle: $APP_BUNDLE"
echo " Binary Size:   ${BIN_SIZE} bytes (${BIN_SIZE_MB} MB) [Target <= 5 MB]"
echo " Bundle Size:   ${BUNDLE_SIZE_KB} KB (${BUNDLE_SIZE_MB} MB) [Target <= 35 MB]"

# Enforce binary <= 5MB (5,242,880 bytes)
if [ "$BIN_SIZE" -gt 5242880 ]; then
  echo "[-] FAILURE: Executable binary exceeds 5 MB limit!" >&2
  exit 1
fi

# Enforce bundle <= 35MB (35,840 KB)
if [ "$BUNDLE_SIZE_KB" -gt 35840 ]; then
  echo "[-] FAILURE: App bundle exceeds 35 MB limit!" >&2
  exit 1
fi

echo "============================================================"
echo " ✓ BUILD SUCCESS: All packaging criteria satisfied!"
echo "============================================================"
