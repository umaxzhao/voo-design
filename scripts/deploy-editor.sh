#!/usr/bin/env bash
set -euo pipefail

TARGET="${VOO_DEPLOY_TARGET:-la}"

if [ "$TARGET" != "la" ]; then
  echo "Error: Only 'la' (103.114.160.86) target is permitted!" >&2
  exit 1
fi

echo "Building editor bundle for production..."
npm run build

REMOTE_HOST="la"
REMOTE_PATH="/var/www/voo.run/editor/"

echo "Deploying dist/ to ${REMOTE_HOST}:${REMOTE_PATH}..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "mkdir -p $REMOTE_PATH"
rsync -avz --delete dist/ "${REMOTE_HOST}:${REMOTE_PATH}"

echo "Deployment to ${TARGET} completed successfully!"
