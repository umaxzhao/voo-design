# UI design benchmark

The runner uses the same authenticated local Codex CLI bridge and agent execution modules as `tests/e2e/codex_agent.e2e.mjs`. Have the local Codex CLI logged in and any required `HTTPS_PROXY` / `HTTP_PROXY` environment variables configured. Live runs require Playwright and its Chromium browser (as in the E2E harness):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run bench:design -- --model gpt-6-astra --tasks=login-form,mobile-home --label=before
npm run bench:design -- --model gpt-6-astra --tasks=login-form,mobile-home --label=after --critique
node scripts/design-bench/score.mjs --label=after --judge
node scripts/design-bench/report.mjs --a=before --b=after
```

Omit `--tasks` for all 30 tasks. `--model` accepts a bare model ID or `codex:<id>` and defaults to `VOO_CODEX_MODEL` or the bridge's default model. `--judge` also works on the runner; it invokes the local Codex CLI (`codex exec -i <png>`, proxy vars inherited from the environment; override model with `VOO_DESIGN_JUDGE_MODEL`) to inspect each screenshot. Judge errors are recorded and cause a nonzero exit rather than fabricated scores.

Outputs live in `$VOO_DESIGN_BENCH_ROOT/<label>/` (default `/workspace/tmp/design-bench`): `<id>.png` is a canvas-only capture at the requested frame resolution, `<id>.json` is the final editor document, and `scores.json` contains lint results, critique rounds, model, timing, tool receipts and any errors. Pass `--out=<dir>` to also copy each final PNG to `<dir>/<id>.png` (the directory is created automatically). Results are checkpointed after each task. Labels accept `[a-z0-9-]+`. Re-running a label replaces its score manifest and selected task artifacts; `--skip-existing` preserves prior records and skips tasks with both JSON and PNG files. Use the same task selection and model in both runs for a useful comparison.

Tasks run strictly one at a time, each in a fresh Chromium browser that is closed after the task; `VOO_DESIGN_BENCH_CONCURRENCY` is ignored. Each task starts with a fresh document. `--critique` uses the shared design quality loop with threshold 85 and at most two additional agent turns. When the shared linter has not landed yet, lint scoring and critique are skipped with a warning; document and screenshot capture still run. Scoring can be repeated later without regenerating the design.

Dedicated server defaults are bridge port 4290 and Vite port 5199. Override with `VOO_DESIGN_BENCH_BRIDGE_PORT` / `VOO_DESIGN_BENCH_VITE_PORT` (or the E2E's `VOO_CODEX_BRIDGE_PORT` / `VOO_CODEX_VITE_PORT`). `VOO_DESIGN_BENCH_TIMEOUT_MS` defaults to 900000 (15 minutes) per task, including critique turns; override it with that environment variable. The HTML pipeline and critique need this headroom: 480 seconds caused hard-deadline blank login/empty results in stitch3. The runner starts its own servers with strict ports and shuts down their process groups when finished.

Repaint saved documents with `node scripts/design-bench/recapture.mjs --label=after --repaint [--tasks=id1,id2] [--out=<dir>]`. Recapture starts Vite without a bridge, loads each JSON into the real app in a fresh headless Chromium browser, waits 1.5 seconds for fonts, and uses the runner’s canvas export path (maximum side 960px). The default recapture also repaints; `--score-only` or the exported `scoreOnly(options)` preserves existing PNGs and renders missing ones. `--repaint` forces rendering even with `--score-only`.

On timeout, the latest checkpoint is restored in a fresh editor page and rendered through the same canvas export path. Judge output is validated as JSON with eight numeric scores from 1–5, with one retry for invalid output; each judged task records `judgeMean`. Reports include per-task scores, available-score means, and up to three positive and negative judge changes.

HTML pipeline runs also save the final reviewed source as `<label>/<id>.html` and record `sourceHtml` in the manifest. Fidelity can replay that source without calling a model:

```sh
node scripts/design-bench/fidelity.mjs --file=/workspace/tmp/design-bench/after/saas-dashboard.html --out=/tmp/fidelity
node scripts/design-bench/fidelity.mjs --fixtures=tests/fixtures/html_fidelity --frame=480x320 --out=/tmp/quality-real/fidelity/before
node scripts/design-bench/fidelity.mjs '--html=<body style="margin:0">Hello</body>' --frame=320x200 --out=/tmp/fidelity
```

The exported `fidelity({ inputs: [{ id, html /* or file */, frame: { width, height } }], out })` accepts strings programmatically. Task filenames inherit task dimensions; other fixtures default to 480×320. Explicit `--frame=WIDTHxHEIGHT` overrides task dimensions. All browser work is serialized with `flock /tmp/voo-e2e.lock`; the worker closes Chromium and its own Vite process group in `finally`.

Each input produces `.html.png`, `.canvas.png`, `.diff.png` (pink marks channel differences >16), `.sbs.png` (HTML left, canvas right), and `.diff.json`. The JSON retains computed DOM styles, direct text Range rects, converter nodes, app nodes before/after batch completion, real text wrapping metrics, and mismatches with a strict >1px geometry tolerance. Discrete wrap/alignment differences are reported regardless of that tolerance. Source metadata uses `htmlSource.id`/`selector` and stable `htmlKey` suffixes for text and border pieces. Padding and gap are compared as effective content/sibling offsets because the current converter bakes CSS layout into flat absolute geometry. Baselines are inferred from DOM Range rectangles and browser font ascent, and compared with the renderer's baseline formula; they are metric evidence, not OCR of exported pixels. Pixel differences include antialiasing and should be reviewed alongside the geometry and layout records before assigning renderer blame.
