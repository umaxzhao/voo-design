# UI design benchmark

The runner uses the same authenticated local Codex CLI bridge and agent execution modules as `tests/e2e/codex_agent.e2e.mjs`. Have the local Codex CLI logged in and the proxy listening at `http://127.0.0.1:7890`. Live runs require Playwright and its Chromium browser (as in the E2E harness):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run bench:design -- --model gpt-6-astra --tasks=login-form,mobile-home --label=before
npm run bench:design -- --model gpt-6-astra --tasks=login-form,mobile-home --label=after --critique
node scripts/design-bench/score.mjs --label=after --judge
node scripts/design-bench/report.mjs
```

Omit `--tasks` for all 20 tasks. `--model` accepts a bare model ID or `codex:<id>` and defaults to `VOO_CODEX_MODEL` or the bridge's default model. `--judge` also works on the runner; it invokes the local Codex CLI (`codex exec -i <png>`, proxy vars set automatically; override model with `VOO_DESIGN_JUDGE_MODEL`) to inspect each screenshot. Judge errors are recorded and cause a nonzero exit rather than fabricated scores.

Outputs live in `/workspace/tmp/design-bench/<before|after>/`: `<id>.png` is a canvas-only capture at the requested frame resolution, `<id>.json` is the final editor document, and `scores.json` contains lint results, critique rounds, model, timing, tool receipts and any errors. Pass `--out=<dir>` to also copy each final PNG to `<dir>/<id>.png` (the directory is created automatically). Results are checkpointed after each task. Re-running a label replaces its score manifest and selected task artifacts. Use the same task selection and model in both runs for a useful comparison.

Tasks run strictly one at a time, each in a fresh Chromium browser that is closed after the task; `VOO_DESIGN_BENCH_CONCURRENCY` is ignored. Each task starts with a fresh document. `--critique` uses the shared design quality loop with threshold 85 and at most two additional agent turns. When the shared linter has not landed yet, lint scoring and critique are skipped with a warning; document and screenshot capture still run. Scoring can be repeated later without regenerating the design.

Dedicated server defaults are bridge port 4290 and Vite port 5199. Override with `VOO_DESIGN_BENCH_BRIDGE_PORT` / `VOO_DESIGN_BENCH_VITE_PORT` (or the E2E's `VOO_CODEX_BRIDGE_PORT` / `VOO_CODEX_VITE_PORT`). `VOO_DESIGN_BENCH_TIMEOUT_MS` defaults to 900000 per task, including critique turns. The runner starts its own servers with strict ports and shuts down their process groups when finished.

Repaint saved documents with `node scripts/design-bench/recapture.mjs --label=after --repaint [--tasks=id1,id2] [--out=<dir>]`. Recapture starts Vite without a bridge, loads each JSON into the real app in a fresh headless Chromium browser, waits 1.5 seconds for fonts, and uses the runner’s canvas export path (maximum side 960px). The default recapture also repaints; `--score-only` or the exported `scoreOnly(options)` preserves existing PNGs and renders missing ones. `--repaint` forces rendering even with `--score-only`.
