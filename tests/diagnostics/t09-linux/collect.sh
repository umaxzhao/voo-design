#!/usr/bin/env bash
# T09 Linux diagnostics, run only after the html2nodes gate has failed (release.yml).
# Diagnostic only: never edits the source tree and never changes the gate result.
# Writes NEW files under VOO_DIAG_OUT: font facts, fixture HTML, gate shots, probe output.
set -u
: "${VOO_DIAG_ROOT:?VOO_DIAG_ROOT must name the checkout root}"
: "${VOO_DIAG_OUT:?VOO_DIAG_OUT must name a new evidence directory}"
: "${VOO_DIAG_SHOTS:?VOO_DIAG_SHOTS must name the gate screenshot directory}"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p -- "$VOO_DIAG_OUT"
git -C "$VOO_DIAG_ROOT" rev-parse HEAD > "$VOO_DIAG_OUT/source-head.txt"
node --version > "$VOO_DIAG_OUT/node-version.txt"
fc-match -f '%{family}\n%{style}\n%{file}\n' Arial > "$VOO_DIAG_OUT/fc-match-arial.txt" 2>&1
fc-match -f '%{family}\n%{style}\n%{file}\n' 'Arial:style=Bold' > "$VOO_DIAG_OUT/fc-match-arial-bold.txt" 2>&1
fc-list > "$VOO_DIAG_OUT/fc-list.txt" 2>&1
cp -R -- "$VOO_DIAG_ROOT/tests/fixtures/html2nodes" "$VOO_DIAG_OUT/fixtures-html"
if [[ -d "$VOO_DIAG_SHOTS" ]]; then cp -R -- "$VOO_DIAG_SHOTS" "$VOO_DIAG_OUT/gate-shots"; else echo "no gate shots directory" > "$VOO_DIAG_OUT/gate-shots-missing.txt"; fi
probe_out="$VOO_DIAG_OUT/probe"
VOO_DIAG_OUT="$probe_out" node "$script_dir/t09-gate-probe.mjs" > "$VOO_DIAG_OUT/probe.log" 2>&1
printf '%s\n' "$?" > "$VOO_DIAG_OUT/probe.exit"
