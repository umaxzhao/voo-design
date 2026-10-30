# voo-model-bridge

A DeepSeek Harness Host plugin that serves the profile's current model on a
loopback OpenAI-compatible endpoint, so the VOO editor's built-in agent can run
on the same model and credentials as the Harness session.

```text
http://127.0.0.1:4399/v1
```

The endpoint binds only `127.0.0.1`, accepts any `Authorization` value (the VOO
preset uses `voo-local`), and answers CORS preflights, so it works from the VOO
dev server (`http://localhost:5173`) and the packaged renderer (`file://`).

## Install

```sh
dsh plugin --profile desktop add "link:/absolute/path/to/voo-model-bridge"
```

Restart DeepSeek Harness and start a new session. Plugin Manager and Settings
show it as "VOO Model Bridge" / "VOO 模型桥" with the VOO icon.

The VOO connector (`voo` bundle) ships the same module as
`lib/model-bridge.js` and inserts it as a second row, so installing the VOO
connector also installs the model bridge; this standalone package exists for
users who only want the bridge, and as the source of truth the connector builder
copies.

## Use from VOO

1. Open VOO → first-run dialog → **API provider** → **DeepSeek Harness models**
   (custom provider preset).
2. Base URL `http://127.0.0.1:4399/v1`, API key `voo-local` (any value works).
3. Click **Fetch models** — the list comes from the Harness profile's provider
   catalog (falling back to the current default model when the catalog is
   unavailable).

The VOO agent then sends `POST /v1/chat/completions` with `stream: true`;
streaming text, streamed tool calls (canvas tools), and `finish_reason`
`stop` / `tool_calls` / `length` are supported. Image content is ignored in this
first version (text and tool calling only) and the request keeps working.

## HTTP surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ ok, provider, model, port, pid, version }` |
| GET | `/v1/models`, `/models` | OpenAI model list from `llm.listModels(provider)` |
| POST | `/v1/chat/completions`, `/chat/completions` | OpenAI chat completion (stream or JSON) |

Every response carries `Access-Control-Allow-Origin: *`;
`OPTIONS` answers `204`.

## Runtime contract

- Provider and model come from the Harness default-model selection
  (`agentDefaultModel.currentSelection()`). The request's `model` overrides the
  model id; the provider route is always the profile's default.
- The bridge writes `~/.dsh/voo-model-bridge.json` after it starts
  (`{ url, port, pid, provider, model, models, startedAt }`) and removes it
  again when the plugin unloads. That file is the discovery contract VOO and
  scripts read; the server falls back to `port + 1` … `+20` when `4399` is
  already taken and writes the actual port there.
- `VOO_MODEL_BRIDGE_PORT` overrides the configured port;
  `VOO_MODEL_BRIDGE_STATE` overrides the description-file path.
- Requests are translated to `ctx.llm.stream({ provider, model, messages,
  tools, system, temperature, maxTokens })`; `stop` is accepted and dropped
  because the Harness adapters reject it.
- No key is stored or logged; only `node:` builtins are imported.

## Files

```text
package.json         dsh.bundle.patch + exports (locale, icon, lib/model-bridge.js)
cordis.patch.yml     inserts the voo-model-bridge Host row (port 4399)
lib/model-bridge.js  the Host plugin and its testable translation helpers
locale/en.json       meta.title / meta.description
locale/zh.json       same, Chinese
icon.png             VOO icon (<256 KiB)
```
