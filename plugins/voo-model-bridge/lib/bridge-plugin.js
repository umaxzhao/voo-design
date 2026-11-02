import { resolveBridgeSettings } from "./bridge-common.js";
import { createModelBridge } from "./bridge-server.js";

/**
 * Cordis Host plugin entry point. `config` is the bundle row's config object
 * (`{ port }`); `ctx.inject` waits for the llm service and `ctx.effect`
 * registers the server cleanup with the plugin fiber.
 */
export function apply(ctx, config = {}) {
  const settings = resolveBridgeSettings(config);
  let selection = null;
  try {
    selection = ctx.get("agentDefaultModel") ?? null;
  } catch {
    selection = null;
  }
  ctx.inject(["llm"], (llmCtx) => {
    const bridge = createModelBridge({
      llm: llmCtx.llm,
      selection,
      port: settings.port,
      host: settings.host,
      statePath: settings.statePath,
      logger: console,
    });
    ctx.effect(() => {
      bridge.start().catch((error) => {
        console.error(`[voo-model-bridge] failed to start: ${error instanceof Error ? error.message : String(error)}`);
      });
      return () => {
        bridge.close().catch(() => {});
      };
    }, "voo-model-bridge: local OpenAI-compatible endpoint");
  });
}
