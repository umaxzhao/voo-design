/**
 * Tool: list_nodes — Query the current canvas state.
 *
 * Read-only tool — never needs approval.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { errorExplanation } from "../../../error_text.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { webGenerationAdvice } from "./generation-route.js";

const def = getWorkflowToolDefinition("list_nodes");
const DEFAULT_CONTENT_LIMIT = 8000;
const MAX_CONTENT_LIMIT = 12000;
const MAX_PAGE_COUNT = 20;
const PAGE_TEXT_FIELDS = ["title", "text", "markdown", "html", "notes"];
const READABLE_FIELDS = {
  [NODE_TYPE.PROMPT]: ["text", "aiPrompt"],
  [NODE_TYPE.AGENT]: ["brief"],
  [NODE_TYPE.PREVIEW]: ["markdown", "html", "outline", "pages"],
};

function invalidContentRequest(message) {
  return createToolError(TOOL_ERROR_CODE.ARGS_INVALID, message, {
    missing: { args: ["nodeId"] },
  });
}

function redactSensitiveText(value) {
  return value
    .replace(/data:[^\s"'<>]+;base64,[a-z0-9+/=]+/gi, "[binary data omitted]")
    .replace(/\bBearer\s+[a-z0-9._~+/-]{16,}/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-z0-9_-]{16,}\b/gi, "[redacted key]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[a-z0-9._~+/-]{16,}/gi,
      "$1=[redacted]",
    );
}

function contentCandidates(node, field, pageIndex, selectedPageField) {
  const data = node.data || {};
  const allowedFields = READABLE_FIELDS[node.type];
  if (!allowedFields) return { reason: "unsupportedNodeType", candidates: [] };
  if (field && !allowedFields.includes(field)) {
    return { reason: "fieldUnavailable", candidates: [] };
  }

  const fields = field ? [field] : allowedFields;
  const candidates = [];
  let totalPages = null;
  for (const name of fields) {
    if (name !== "pages") {
      if (typeof data[name] === "string" && data[name].length > 0) {
        candidates.push({ field: name, value: data[name] });
      }
      continue;
    }
    const pages = Array.isArray(data.pages) ? data.pages : [];
    totalPages = pages.length;
    const start = pageIndex ?? 0;
    const end =
      pageIndex === undefined
        ? Math.min(pages.length, MAX_PAGE_COUNT)
        : Math.min(start + 1, pages.length);
    for (let index = start; index < end; index += 1) {
      const page = pages[index];
      // String pages are media URLs/IDs in Preview. Never echo them as text.
      if (!page || typeof page !== "object" || Array.isArray(page)) continue;
      for (const pageField of PAGE_TEXT_FIELDS) {
        if (selectedPageField && selectedPageField !== pageField) continue;
        if (typeof page[pageField] === "string" && page[pageField].length > 0) {
          candidates.push({
            field: "pages",
            pageIndex: index,
            pageField,
            value: page[pageField],
          });
        }
      }
    }
  }
  return { candidates, totalPages };
}

function readNodeContent(node, args) {
  const { candidates, reason, totalPages } = contentCandidates(
    node,
    args.field,
    args.pageIndex,
    args.pageField,
  );
  if (reason)
    return { available: false, reason, sections: [], truncated: false };
  if (candidates.length === 0) {
    return {
      available: false,
      reason: "noTextContent",
      sections: [],
      truncated: false,
      ...(totalPages === null ? {} : { totalPages }),
    };
  }

  let remaining = args.limit ?? DEFAULT_CONTENT_LIMIT;
  let truncated = false;
  const sections = [];
  for (const [index, candidate] of candidates.entries()) {
    const sanitized = redactSensitiveText(candidate.value);
    const offset = args.offset ?? 0;
    const value = sanitized.slice(offset, offset + remaining);
    const hasMore = offset + value.length < sanitized.length;
    sections.push({
      field: candidate.field,
      ...(candidate.pageIndex === undefined
        ? {}
        : { pageIndex: candidate.pageIndex, pageField: candidate.pageField }),
      value,
      originalLength: candidate.value.length,
      readableLength: sanitized.length,
      offset,
      nextOffset: hasMore ? offset + value.length : null,
      truncated: hasMore,
      redacted: sanitized !== candidate.value,
    });
    remaining -= value.length;
    if (hasMore || (remaining === 0 && index < candidates.length - 1))
      truncated = true;
    if (remaining === 0) break;
  }
  if (sections.length < candidates.length) truncated = true;
  if (
    totalPages !== null &&
    args.pageIndex === undefined &&
    totalPages > MAX_PAGE_COUNT
  )
    truncated = true;
  return {
    available: true,
    sections,
    truncated,
    ...(totalPages === null ? {} : { totalPages }),
  };
}

function validateContentArgs(args) {
  if (
    args.includeContent !== undefined &&
    typeof args.includeContent !== "boolean"
  ) {
    throw invalidContentRequest("includeContent must be a boolean.");
  }
  if (args.includeContent !== true) {
    if (
      ["field", "pageIndex", "pageField", "offset", "limit"].some(
        (key) => args[key] !== undefined,
      )
    ) {
      throw invalidContentRequest(
        "Content options require includeContent=true.",
      );
    }
    return;
  }
  if (typeof args.nodeId !== "string" || args.nodeId.trim() === "") {
    throw invalidContentRequest("includeContent requires an exact nodeId.");
  }
  if (args.filter !== undefined)
    throw invalidContentRequest(
      "filter cannot be combined with includeContent.",
    );
  if (
    args.field !== undefined &&
    ![
      "text",
      "aiPrompt",
      "brief",
      "markdown",
      "html",
      "outline",
      "pages",
    ].includes(args.field)
  ) {
    throw invalidContentRequest("field is not a readable text field.");
  }
  if (!Number.isInteger(args.offset ?? 0) || (args.offset ?? 0) < 0) {
    throw invalidContentRequest("offset must be a non-negative integer.");
  }
  if (
    !Number.isInteger(args.limit ?? DEFAULT_CONTENT_LIMIT) ||
    (args.limit ?? DEFAULT_CONTENT_LIMIT) < 1 ||
    (args.limit ?? DEFAULT_CONTENT_LIMIT) > MAX_CONTENT_LIMIT
  ) {
    throw invalidContentRequest("limit must be between 1 and 12000.");
  }
  if ((args.offset ?? 0) > 0 && !args.field) {
    throw invalidContentRequest("field is required when offset is set.");
  }
  if (
    args.pageIndex !== undefined &&
    (args.field !== "pages" ||
      !Number.isInteger(args.pageIndex) ||
      args.pageIndex < 0)
  ) {
    throw invalidContentRequest(
      "pageIndex requires the pages field and a non-negative integer.",
    );
  }
  if (
    args.pageField !== undefined &&
    (args.field !== "pages" ||
      args.pageIndex === undefined ||
      !PAGE_TEXT_FIELDS.includes(args.pageField))
  ) {
    throw invalidContentRequest(
      "pageField requires a pageIndex and a supported page text field.",
    );
  }
  if (
    (args.offset ?? 0) > 0 &&
    args.field === "pages" &&
    (args.pageIndex === undefined || args.pageField === undefined)
  ) {
    throw invalidContentRequest(
      "pageIndex and pageField are required when paging through a page.",
    );
  }
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    validateContentArgs(args);
    if (args.includeContent === true) {
      const node = (store.nodes || []).find((item) => item.id === args.nodeId);
      if (!node) {
        throw createToolError(
          TOOL_ERROR_CODE.NODE_NOT_FOUND,
          `Node not found: ${args.nodeId}`,
          {
            missing: { nodes: [args.nodeId] },
          },
        );
      }
      context.recordObservedObjects?.([node]);
      return {
        nodeId: node.id,
        type: node.type,
        rev: typeof node.rev === "number" ? node.rev : (node.data?.rev ?? 0),
        content: readNodeContent(node, args),
      };
    }
    let nodes = store.nodes || [];

    if (args.nodeId) nodes = nodes.filter((node) => node.id === args.nodeId);

    if (args.filter) {
      nodes = nodes.filter((n) => n.type === args.filter);
    }

    const edges = store.edges || [];

    const result = nodes.map((node) => {
      // A failed website attempt stays askable here too: list_nodes is how the
      // agent revisits a node after the run, so it must carry the same "which
      // model instead?" facts as the run receipt.
      const advice = webGenerationAdvice({
        nodeId: node.id,
        data: node.data,
        nodeType: node.type,
      });
      return {
        id: node.id,
        type: node.type,
        label: node.data?.label || null,
        position: node.position,
        prompt: node.data?.prompt || null,
        platform: node.data?.platform || node.data?.layoutPlatform || null,
        selected: Boolean(node.selected),
        execution: {
          status: node.data?.status ?? "idle",
          stage: node.data?.stage ?? null,
          resultIds: [...(node.data?.results ?? [])],
          error: node.data?.error ?? null,
          // The code is the machine-readable cause and stays as it came off the
          // node; this is the sentence the run banner would show for it, so the
          // agent can explain the failure instead of reading the code back.
          // Null for a code with no authored copy: it is then the whole answer.
          explanation: errorExplanation(node.data?.error ?? null) || null,
          recovery: node.data?.webGeneration
            ? {
                mode: "collect_existing_web_generation",
                operationId: node.data.webGeneration.operationId,
                tool: "run_workflow",
                args: { nodeIds: [node.id] },
              }
            : null,
          ...(advice ? { webGenerationAdvice: advice } : {}),
        },
        rev:
          typeof node.rev === "number"
            ? node.rev
            : typeof node.data?.rev === "number"
              ? node.data.rev
              : 0,
        hasImage: Boolean(
          node.data?.imageId && store.images?.[node.data.imageId],
        ),
        incomingEdges: edges
          .filter((e) => e.target === node.id)
          .map((e) => ({ from: e.source, handle: e.sourceHandle })),
        outgoingEdges: edges
          .filter((e) => e.source === node.id)
          .map((e) => ({ to: e.target, handle: e.targetHandle })),
      };
    });

    if (context.recordObservedObjects) {
      context.recordObservedObjects(nodes);
    }

    // The count label is "selected" when a filter is absent; the model can ask
    // list_nodes with no filter to see which nodes are currently selected.
    return { count: result.length, nodes: result };
  },

  presentCall(args) {
    return {
      title: args.includeContent
        ? args.nodeId
        : args.filter
          ? `List ${args.filter} nodes`
          : "List all nodes",
      icon: "list",
    };
  },

  presentResult(_args, result) {
    return {
      title: result.content ? result.nodeId : `${result.count} node(s) found`,
      status: "completed",
    };
  },
});
