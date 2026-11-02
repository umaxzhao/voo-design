# Agent poster brief stops after variable setup

## Diagnosis

The code-level failure is reproducible without a provider: `AGENT_DEFAULTS.maxSteps` was 8, while `createToolTurn.requestTool` publishes a separate model boundary for every native MCP `call_tool`. `runAgentTurn` counts each boundary against that limit. The design-quality instructions require inspection, planning and variables before drawing. For example:

1. `inspect_layer_tree`
2. `list_variables`
3. `update_plan`
4. `create_variable_collection`
5–8. Four `create_variable` calls

All eight tools succeed, but `runAgentTurn` then throws `agentStepLimit` before requesting the next model step. No canvas creation tool has run. This produces precisely the reported variables-only side effects. The settings UI previously capped the limit at 16, also tight for a native design turn. The HTTP path can batch several calls in one step; native MCP pauses once per call.

The panel catch discarded the cause, mapping every error except missing configuration to `agent.panel.failed` (Chinese: “Agent 未能完成本次请求。”). Thus a step limit, provider failure, and CLI timeout all looked the same. A limit also left the native session parked waiting for its last tool receipt until its own timeout.

No historical per-turn trace was available in the inspected `/workspace/tmp/voo-agent-*` directories (empty). Consequently this is a deterministic reproduction and code diagnosis matching the screenshot, not proof of the exact exception from that original run. A Claude CLI preflight (`claude -p ok --output-format json`, proxy enabled) produced no output within 35 seconds and was terminated by `timeout`; live provider/UI reproduction was unavailable.

## Fix

- Raise the default tool-step budget to 64 and the settings ceiling to 128. Respect explicit saved limits; low limits now produce an actionable localized message explaining how to increase them.
- Keep initial token setup small and explicitly require canvas layers for poster/layout creation briefs. Retain the design-quality kit, tokens-first instructions and capture verification. Generation guidance requires Lucide icons rather than emoji icons, and Tailwind utility classes on the HTML path.
- For recognized English/Chinese creation briefs, if the model finishes without a successful canvas creation tool, send one recovery request to build the content. If it still stops, raise `agentNoCanvasContent` with a localized suggestion to change models or explicitly request frames/text. Inspection and token-only requests do not require new layers. This guard tracks successful tool receipts, not rendered pixels; existing capture verification remains responsible for visual review.
- Display the original error through the shared localized error formatter, including raw provider diagnostics. Preserve the cancellation guard; no cancel/retry controls changed.
- Close any remaining native CLI session on turn exit, including step-limit failures. Cleanup errors cannot replace the original cause.

## Regression coverage

`tests/unit/agent_poster_completion.test.js` joins the real MCP tool-turn handshake, renderer CLI transport, stream adapter and agent runtime, replacing only model decisions and the canvas host. It demonstrates the old eight-call cutoff, completion past token setup using real frame/text tool executors, receipt delivery, native error preservation, bounded recovery, and non-creation requests. Related design-quality, panel, settings, tool and undo/cancel tests cover compatibility.

The existing design-quality prompt hook fixture now asks to inspect an admin dashboard, keeping that test focused on prompt composition rather than asserting that a creation request may finish without layers.
