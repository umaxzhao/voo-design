#!/usr/bin/env bash
set -euo pipefail

TARGET="${VOO_DEPLOY_TARGET:-la2}"
REMOTE_PATH="/srv/voo-run/current/web/public/editor/models"
SSH_OPTIONS="ssh -o ControlMaster=no -o BatchMode=yes -o ConnectTimeout=12"
# These are the background-removal and LaMa weights served by this installation.
# Small verified upscalers are bundled for desktop and cached on first use on the web.
REQUIRED_MODELS=(rmbg-1.4-fp16.onnx lama_512_fp16.onnx lama_512_int8.onnx realesr-general-x4v3.onnx realesr-animevideov3.onnx)

if [ "$TARGET" != "la2" ]; then
  echo "Error: Only the configured 'la2' SSH target is permitted." >&2
  exit 1
fi
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--check" ] && [ "$1" != "--client" ]; }; then
  echo "Usage: bash scripts/deploy-editor-models.sh --check | --client; or VOO_DEPLOY_MODELS_SOURCE=/path/to/models bash scripts/deploy-editor-models.sh" >&2
  exit 1
fi

if [ "${1:-}" = "--client" ]; then
  node scripts/verify-client-models.mjs
  $SSH_OPTIONS "$TARGET" "mkdir -p '$REMOTE_PATH'"
  rsync -az -e "$SSH_OPTIONS" vendor/client-models/ "${TARGET}:${REMOTE_PATH}/"
elif [ "${1:-}" != "--check" ]; then
  SOURCE="${VOO_DEPLOY_MODELS_SOURCE:?Set VOO_DEPLOY_MODELS_SOURCE to the licensed model directory}"
  for MODEL in "${REQUIRED_MODELS[@]}"; do
    if [ ! -s "$SOURCE/$MODEL" ]; then
      echo "Error: Required model is missing or empty: $MODEL" >&2
      exit 1
    fi
  done
  $SSH_OPTIONS "$TARGET" "mkdir -p '$REMOTE_PATH'"
  # Weight publication is independent of web builds. Preserve legacy weights.
  rsync -az --include '*/' --include '*.onnx' --exclude '*' -e "$SSH_OPTIONS" "$SOURCE/" "${TARGET}:${REMOTE_PATH}/"
fi

for MODEL in "${REQUIRED_MODELS[@]}"; do
  $SSH_OPTIONS "$TARGET" "test -s '$REMOTE_PATH/$MODEL'" || {
    echo "Error: Deployed model $MODEL is missing; publish weights with scripts/deploy-editor-models.sh before the web release." >&2
    exit 1
  }
done
echo "Verified client background-removal, repair and upscale download assets on $TARGET."
