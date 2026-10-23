# Export pixel regression suite

Run from the repository root (Playwright Chromium must be installed):

```sh
flock /tmp/voo-e2e.lock npx vitest run --config tests/export/export.config.mjs --maxWorkers=2 --minWorkers=1
```

The suite starts and closes its own Vite server and Chromium. It uses the real
page PNG exporter, SVG serializer and PDF encoder, with a local pinned WOFF2
font and a generated checkerboard bitmap; no external assets or app state.
The 256×160 transparent design covers linear and off-centre elliptical radial gradients,
multiline text, image opacity and compounded fill/node alpha.

Each format has its own committed PNG golden: PNG and SVG renderers have
known differences in gradient interpolation and text layout. Each channel may
differ by at most 2; no channels exceeding that tolerance are allowed. Analytical
pixel checks independently verify transparency, bitmap content, gradient direction,
radial origin/radii and text alpha before accepting any baseline update. PDF checks
signature, physical page size, xref offsets and exact decompressed RGB/alpha
content against the source PNG (not a PDF viewer screenshot).

Review images and exported files are written to
`/workspace/tmp/shots-export-verify/`. A failed comparison saves a red amplified
diff and actual image there. Goldens are copied there on successful comparisons.
To deliberately regenerate goldens, prefix the command with
`UPDATE_EXPORT_GOLDENS=1` **after acquiring the lock** (use `flock ... env
UPDATE_EXPORT_GOLDENS=1 npx ...`). Review both PNG files before committing.

SVG font bytes are embedded in the test output, matching standalone SVG decoding
rather than relying on fonts installed on the host. This suite is separate from
the default Node-only unit suite so that ordinary unit runs do not launch browsers
without the shared lock. Pure SVG regression tests also run in the unit suite.
