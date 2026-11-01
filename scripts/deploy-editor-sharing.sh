#!/usr/bin/env bash
set -euo pipefail

TARGET="${VOO_DEPLOY_TARGET:-la2}"
if [ "$TARGET" != "la2" ]; then
  echo "Error: Only the configured 'la2' SSH target is permitted." >&2
  exit 1
fi
SSH_OPTIONS="ssh -o ControlMaster=no -o BatchMode=yes -o ConnectTimeout=12"
REMOTE_SNIPPET="/tmp/voo-editor-sharing-$(date -u +%Y%m%dT%H%M%SZ)-$$.conf"
rsync -az -e "$SSH_OPTIONS" scripts/nginx-editor-sharing.conf "$TARGET:$REMOTE_SNIPPET"

$SSH_OPTIONS "$TARGET" bash -s -- "$REMOTE_SNIPPET" <<'REMOTE'
set -euo pipefail
exec 9>/var/lock/voo-editor-sharing.lock
flock 9
SOURCE="$1"
SITE="/etc/nginx/sites-enabled/voo-run-tls"
SNIPPET="/etc/nginx/snippets/voo-editor-sharing.conf"
BACKUP="$(mktemp -d /etc/nginx/voo-editor-sharing-backup-XXXXXX)"
cp -pL "$SITE" "$BACKUP/site"
if [ -f "$SNIPPET" ]; then cp -p "$SNIPPET" "$BACKUP/snippet"; fi
COMPLETED=0
restore_on_failure() {
  if [ "$COMPLETED" != "1" ]; then
    cat "$BACKUP/site" > "$SITE"
    if [ -f "$BACKUP/snippet" ]; then cp -p "$BACKUP/snippet" "$SNIPPET"; else rm -f "$SNIPPET"; fi
    nginx -t && systemctl reload nginx
  fi
  rm -f "$SOURCE"
}
trap restore_on_failure EXIT
install -m 644 "$SOURCE" "$SNIPPET"
python3 - "$SITE" <<'PY'
from pathlib import Path
import sys
site = Path(sys.argv[1])
content = site.read_text()
include = "    include /etc/nginx/snippets/voo-editor-sharing.conf;"
if include not in content:
    anchor = "    include /etc/nginx/snippets/voo-editor-models.conf;"
    if content.count(anchor) != 1:
        raise SystemExit("Expected one editor models location; refusing ambiguous site mutation")
    site.write_text(content.replace(anchor, anchor + "\n" + include))
PY
nginx -t
systemctl reload nginx
COMPLETED=1
echo "Verified legacy editor sharing routes; configuration backup: $BACKUP"
REMOTE
