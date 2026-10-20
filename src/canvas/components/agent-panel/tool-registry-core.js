// Registry core: handler registration, exposure, approval, and capabilities.

import { TOOL_APPROVAL_LEVEL } from "./eventTypes.js";

export const TOOL_EXPOSURE = {
  DIRECT: "direct",
  DEFERRED: "deferred",
  HIDDEN: "hidden",
};

function defaultCapabilities(handler) {
  const level = handler.approvalLevel || TOOL_APPROVAL_LEVEL.CANVAS_MUTATION;
  return {
    mutates: level !== TOOL_APPROVAL_LEVEL.READ_ONLY,
    externalData: level === TOOL_APPROVAL_LEVEL.EXTERNAL_API,
    estimatedCost: 0,
    idempotent: false,
    reversible: null,
    timeout: null,
    verify: null,
  };
}

export class ToolRegistryCore {
  constructor() {
    /** @type {Map<string, import("./toolRegistry.js").ToolHandler>} */
    this._tools = new Map();
    this._pricingTable = null;
  }

  register(handler) {
    if (!handler.spec?.name) {
      throw new Error("Tool handler must have spec.name");
    }
    if (typeof handler.execute !== "function") {
      throw new Error(
        `Tool "${handler.spec.name}" must export an execute function`,
      );
    }
    this._tools.set(handler.spec.name, handler);
  }

  getToolSchemas() {
    const schemas = [];
    for (const [, handler] of this._tools) {
      const exposure = handler.exposure || TOOL_EXPOSURE.DIRECT;
      if (exposure !== TOOL_EXPOSURE.DIRECT) continue;
      schemas.push(this._toApiSchema(handler));
    }
    return schemas;
  }

  getSchemasFor(names) {
    const schemas = [];
    for (const name of names) {
      const handler = this._tools.get(name);
      if (handler) schemas.push(this._toApiSchema(handler));
    }
    return schemas;
  }

  getSchema(name) {
    const handler = this._tools.get(name);
    return handler ? this._toApiSchema(handler) : null;
  }

  getDirectToolNames() {
    const names = [];
    for (const [, handler] of this._tools) {
      if ((handler.exposure || TOOL_EXPOSURE.DIRECT) === TOOL_EXPOSURE.DIRECT) {
        names.push(handler.spec.name);
      }
    }
    return names;
  }

  searchDeferredTools(query, limit = 8) {
    const q = query.toLowerCase().trim();
    const results = [];
    for (const [, handler] of this._tools) {
      if (
        (handler.exposure || TOOL_EXPOSURE.DIRECT) !== TOOL_EXPOSURE.DEFERRED
      ) {
        continue;
      }
      if (handler.isAvailable && !handler.isAvailable()) continue;
      const haystack =
        `${handler.spec.name} ${handler.spec.description}`.toLowerCase();
      if (!q || haystack.includes(q)) {
        results.push({
          name: handler.spec.name,
          description: handler.spec.description,
        });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  _toApiSchema(handler) {
    return {
      type: "function",
      function: {
        name: handler.spec.name,
        description: handler.spec.description,
        parameters: handler.spec.parameters,
      },
    };
  }

  getDeferredToolSummaries() {
    const summaries = [];
    for (const [, handler] of this._tools) {
      if (
        (handler.exposure || TOOL_EXPOSURE.DIRECT) === TOOL_EXPOSURE.DEFERRED
      ) {
        summaries.push({
          name: handler.spec.name,
          description: handler.spec.description,
        });
      }
    }
    return summaries;
  }

  get(name) {
    return this._tools.get(name);
  }

  needsApproval(toolName, approvalMode) {
    const handler = this._tools.get(toolName);
    if (!handler) return true; // Unknown tools always need approval.
    const level = handler.approvalLevel || TOOL_APPROVAL_LEVEL.CANVAS_MUTATION;
    if (
      handler.alwaysRequiresApproval ||
      level === TOOL_APPROVAL_LEVEL.REQUIRES_APPROVAL
    ) {
      return true;
    }
    switch (approvalMode) {
      case "never":
        return level !== TOOL_APPROVAL_LEVEL.READ_ONLY;
      case "on-request":
        return false;
      case "suggest":
        return level !== TOOL_APPROVAL_LEVEL.READ_ONLY;
      case "full-auto":
      case "auto_execute":
      case "auto-execute":
        return level === TOOL_APPROVAL_LEVEL.DESTRUCTIVE;
      case "auto-review":
        return false;
      case "auto-create":
        return (
          level === TOOL_APPROVAL_LEVEL.EXTERNAL_API ||
          level === TOOL_APPROVAL_LEVEL.DESTRUCTIVE
        );
      default:
        return level !== TOOL_APPROVAL_LEVEL.READ_ONLY;
    }
  }

  getCapabilities(toolName) {
    const handler = this._tools.get(toolName);
    if (!handler) return null;
    return { ...defaultCapabilities(handler), ...(handler.capabilities || {}) };
  }

  setPricingTable(pricingTable) {
    this._pricingTable = pricingTable;
  }

  getPricingTable() {
    return this._pricingTable || null;
  }

  isReviewable(toolName) {
    const caps = this.getCapabilities(toolName);
    return Boolean(caps?.mutates);
  }

  get size() {
    return this._tools.size;
  }
}
