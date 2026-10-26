#!/usr/bin/env bash
set -euo pipefail

TARGET="${VOO_DEPLOY_TARGET:-la2}"
REMOTE_PATH="/srv/voo-run/current/web/public/editor"
PREVIEW_URL="https://voo.run/editor/"
REVISION="${VOO_DEPLOY_REVISION:-$(git rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)}"

if [ "$TARGET" != "la2" ]; then
  echo "Error: Only the configured 'la2' SSH target is permitted." >&2
  exit 1
fi
if [[ ! "$REVISION" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "Error: Invalid deployment revision." >&2
  exit 1
fi

if [ "${VOO_DEPLOY_SKIP_BUILD:-0}" != "1" ]; then
  npm run build
fi
if [ ! -f dist/index.html ]; then
  echo "Error: dist/index.html is missing; build the editor before deploying." >&2
  exit 1
fi

BACKUP_PATH="/srv/voo-run/editor-backups/${REVISION}-$(date -u +%Y%m%dT%H%M%SZ)"
SSH_OPTIONS="ssh -o BatchMode=yes -o ConnectTimeout=12"

# Hard-link the old release before rsync's atomic per-file replacements.
# Keep old hashed chunks so open tabs can still load their lazy modules.
$SSH_OPTIONS "$TARGET" "mkdir -p /srv/voo-run/editor-backups; if [ -d '$REMOTE_PATH' ]; then cp -al '$REMOTE_PATH' '$BACKUP_PATH'; else mkdir -p '$REMOTE_PATH'; fi"
rsync -az --exclude '.DS_Store' --exclude 'index.html' -e "$SSH_OPTIONS" dist/ "${TARGET}:${REMOTE_PATH}/"
# Publish the entry point last, only after every referenced asset arrived.
rsync -az -e "$SSH_OPTIONS" dist/index.html "${TARGET}:${REMOTE_PATH}/index.html"

echo "Deployed ${REVISION} to ${PREVIEW_URL}"
echo "Previous release backup: ${TARGET}:${BACKUP_PATH}"
