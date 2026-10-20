// Registry dispatch: precondition checks, canvas adapters, retries, and errors.

import {
  createToolError,
  normalizeToolError,
  TOOL_ERROR_CODE,
} from "./tools/errors.js";
import { checkRequires } from "./tools/requires.js";
import { createCanvasPixelAdapter } from "./canvasPixelAdapter.js";
import {
  executeWithRetry,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
} from "./idempotentRetry.js";
import { ToolRegistryCosts } from "./tool-registry-costs.js";

export class ToolRegistry extends ToolRegistryCosts {
  async dispatch(toolName, args, context) {
    if (context?.signal?.aborted) return this._abortedResult();
    const handler = this._tools.get(toolName);
    if (!handler) {
      return {
        success: false,
        error: normalizeToolError(
          createToolError(
            TOOL_ERROR_CODE.UNKNOWN,
            `Unknown tool: ${toolName}`,
            {
              missing: { tools: [toolName] },
              suggestion: {
                tool: "tool_search",
                args: {},
                note: "Search available tools with tool_search, then retry.",
              },
            },
          ),
        ),
      };
    }
    let enrichedContext = context;
    if (!context?.rasterizeCanvas || !context?.getCanvasPixels) {
      let store = null;
      try {
        store =
          typeof context?.getStore === "function"
            ? context.getStore()
            : (context?.store ?? null);
      } catch {
        store = null;
      }
      if (store) {
        const adapter = createCanvasPixelAdapter(store);
        enrichedContext = {
          ...context,
          rasterizeCanvas:
            context?.rasterizeCanvas ||
            ((opts) => adapter.rasterizeCanvas(opts)),
          getCanvasPixels:
            context?.getCanvasPixels ||
            ((region) => adapter.getCanvasPixels(region)),
        };
      }
    }
    try {
      await checkRequires(handler, args ?? {}, enrichedContext);
      if (enrichedContext?.signal?.aborted) return this._abortedResult();
      const result = await executeWithRetry(
        () => handler.execute(args ?? {}, enrichedContext),
        {
          isIdempotent: Boolean(this.getCapabilities(toolName)?.idempotent),
          signal: enrichedContext?.signal,
          maxRetries: enrichedContext?.maxRetries ?? DEFAULT_MAX_RETRIES,
          baseDelayMs:
            enrichedContext?.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
          onRetry: enrichedContext?.onRetry,
        },
      );
      return { success: true, result };
    } catch (err) {
      if (context?.throwOnError) throw err;
      return { success: false, error: normalizeToolError(err) };
    }
  }

  _abortedResult() {
    return {
      success: false,
      error: normalizeToolError(
        createToolError(
          TOOL_ERROR_CODE.OPERATION_ABORTED,
          "Operation aborted.",
        ),
      ),
    };
  }
}

export { executeWithRetry, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BASE_DELAY_MS };
