#!/usr/bin/env bash
set -euo pipefail

TARGET="${VOO_DEPLOY_TARGET:-la}"

if [ "$TARGET" != "la" ]; then
  echo "Error: Only 'la' (la.voo.run / 103.114.160.86) target is permitted!" >&2
  exit 1
fi

if [ "${VOO_DEPLOY_SKIP_BUILD:-0}" != "1" ]; then
  echo "Building editor bundle for production..."
  npm run build
fi

if [ ! -f dist/index.html ]; then
  echo "Error: dist/index.html is missing; build the editor before deploying." >&2
  exit 1
fi

REMOTE_HOST="la"
REMOTE_PATH="/var/www/voo.run/editor/"

echo "Deploying dist/ to ${REMOTE_HOST}:${REMOTE_PATH}..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "mkdir -p $REMOTE_PATH"
rsync -avz --delete dist/ "${REMOTE_HOST}:${REMOTE_PATH}"

echo "Deployment to ${TARGET} (https://la.voo.run/editor/) completed successfully!"
