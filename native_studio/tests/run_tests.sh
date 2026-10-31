#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
STUDIO_DIR="$( cd "$DIR/.." && pwd )"
BUILD_DIR="$STUDIO_DIR/build"
TEST_BIN="$BUILD_DIR/VOODesignE2ETests"

mkdir -p "$BUILD_DIR"

TEST_FILES=(
  "$DIR/TestHarness.swift"
  "$DIR/Tier1_FeatureCoverageTests.swift"
  "$DIR/Tier2_BoundaryCornerTests.swift"
  "$DIR/Tier3_CrossFeatureTests.swift"
  "$DIR/Tier4_RealWorldScenarioTests.swift"
  "$DIR/UIParityTests.swift"
  "$DIR/CanvasInteractionTests.swift"
  "$DIR/M1_ToolFlyoutContextualTaskbarTests.swift"
  "$DIR/M2_InspectorStudioTests.swift"
  "$DIR/WorkspaceManagerTests.swift"
  # "$DIR/AIAgentTests.swift"
  "$DIR/main.swift"
)

# Parse mode flags
MODE="auto"
EXTRA_ARGS=()
for arg in "$@"; do
  if [ "$arg" == "--integrated" ]; then
    MODE="integrated"
  elif [ "$arg" == "--standalone" ]; then
    MODE="standalone"
  else
    EXTRA_ARGS+=("$arg")
  fi
done

# If mode is auto, check if complete production engine sources exist
if [ "$MODE" == "auto" ]; then
  if [ -f "$STUDIO_DIR/Sources/Engine/GeometryEngine.swift" ] && [ -f "$STUDIO_DIR/Sources/Engine/CommandManager.swift" ]; then
    MODE="integrated"
  else
    MODE="standalone"
  fi
fi

if [ "$MODE" == "integrated" ]; then
  echo "=== [Integrated Mode] Compiling against production Sources/ ==="
  APP_SOURCES=$(find "$STUDIO_DIR/Sources" -name "*.swift" ! -name "Main.swift" ! -name "main.swift")
  INTEGRATION_FLAGS=(-D INTEGRATED)
  SUPPORT_FALLBACK=()
  if [ ! -f "$STUDIO_DIR/Sources/Engine/MetalRenderPipeline.swift" ]; then
    SUPPORT_FALLBACK+=("$DIR/Support/ReferenceRasterPipeline.swift")
  fi
  SUPPORT_FALLBACK+=("$DIR/Support/ReferenceUIStudio.swift")
  SOURCES_TO_COMPILE=($APP_SOURCES "${SUPPORT_FALLBACK[@]}" "${TEST_FILES[@]}")
else
  echo "=== [Standalone Reference Mode] Compiling with tests/Support/ reference models ==="
  SUPPORT_SOURCES=($(find "$DIR/Support" -name "*.swift"))
  SOURCES_TO_COMPILE=("${SUPPORT_SOURCES[@]}" "${TEST_FILES[@]}")
  INTEGRATION_FLAGS=()
fi

echo "=== 正在编译 VOO Design Native Studio E2E 测试套件 ==="
mkdir -p "$BUILD_DIR/ModuleCache"
swiftc \
  -O \
  -module-cache-path "$BUILD_DIR/ModuleCache" \
  -target arm64-apple-macosx14.0 \
  -sdk $(xcrun --show-sdk-path) \
  -framework AppKit \
  -framework CoreGraphics \
  -framework CoreImage \
  -framework Metal \
  -framework MetalKit \
  "${INTEGRATION_FLAGS[@]}" \
  "${SOURCES_TO_COMPILE[@]}" \
  -o "$TEST_BIN"

echo "=== 正在执行 VOO Design Native Studio E2E 测试 ==="
# The harness binary is not an .app bundle, so point the theme at the source fonts
# to exercise the same bundled faces (Intel One Mono / Inter) as the shipped app.
VOO_FONT_DIR="$STUDIO_DIR/Resources/Fonts" "$TEST_BIN" "${EXTRA_ARGS[@]}"
