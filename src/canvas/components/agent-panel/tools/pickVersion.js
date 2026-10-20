/**
 * Tool: pick_version — list and select a generated version of a node.
 *
 * Every generating node keeps its outputs as a version list:
 *
 *   layout  (imageAsset)   data.layoutVersions [{id, html, createdAt, meta}]
 *                          + data.selectedLayoutVersionId — selecting lands
 *                          the version's HTML back through parseLayoutHtml so
 *                          the layers in the design editor actually change
 *                          (the UI's FlatSelect only swaps the raw HTML).
 *   text    (prompt)       data.versions [{id, text, createdAt}]
 *                          + data.selectedVersionId — selecting restores the
 *                          version's text into the node.
 *   media   (generate /
 *           videoShot / ...) data.results [assetId, ...] + data.selectedIndex —
 *                          selecting switches the active result; pure editor
 *                          nodes fed from this source follow the new pick.
 *
 * Call with only `nodeId` to LIST the available versions (read-only); then
 * pick with `versionId` (layout/text) or `index`/`assetId` (media). Failures
 * answer structured receipts: NO_VERSIONS, INDEX_OUT_OF_RANGE,
 * VERSION_NOT_FOUND, ASSET_MISSING.
 */

import { commitWorkflowHistory } from "../../../undo-action-contracts.js";

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";

/** Node types whose `results` array holds media assets (image/video ids). */
const MEDIA_NODE_TYPES = new Set([
  NODE_TYPE.GENERATE,
  NODE_TYPE.VIDEO,
  NODE_TYPE.COMBINE_VIDEO,
  NODE_TYPE.API_IMAGE,
  NODE_TYPE.API_VIDEO,
]);

/** Channel of a node: which version list it keeps. */
function channelOf(node) {
  if (node.type === NODE_TYPE.IMAGE_EDITOR) return "layout";
  if (node.type === NODE_TYPE.PROMPT) return "text";
  if (MEDIA_NODE_TYPES.has(node.type)) return "media";
  return null;
}

function listSuggestion() {
  return {
    tool: "pick_version",
    args: {},
    note: "Call pick_version with only nodeId to list the available versions, then retry with a valid versionId/index.",
  };
}

function noVersionsSuggestion(channel) {
  return {
    tool: channel === "layout" ? "generate_layout" : "run_workflow",
    args: {},
    note:
      channel === "layout"
        ? "Generate a layout first (generate_layout) so the node has layoutVersions, then retry."
        : "Run the workflow first (run_workflow) so the node has results, then retry.",
  };
}

/** "…<html>" preview for a layout version. */
function htmlPreview(html) {
  const flat = String(html ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** Selector args supplied by the model (empty when just listing). */
function givenSelector(args) {
  const selectors = ["versionId", "index", "assetId"].filter(
    (name) =>
      args[name] !== undefined && args[name] !== null && args[name] !== "",
  );
  return selectors;
}

function resolveIndex(versions, { index, versionId, assetId, channel }) {
  if (versionId !== undefined && versionId !== null && versionId !== "") {
    if (channel === "media") {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Media nodes select by index or assetId, not versionId.",
        {
          missing: { args: ["index"] },
          suggestion: listSuggestion(),
        },
      );
    }
    const found = versions.findIndex((version) => version.id === versionId);
    if (found < 0) {
      throw createToolError(
        TOOL_ERROR_CODE.VERSION_NOT_FOUND,
        `Version not found: ${versionId}`,
        {
          missing: { versions: [versionId] },
          suggestion: listSuggestion(),
        },
      );
    }
    return found;
  }
  if (assetId !== undefined && assetId !== null && assetId !== "") {
    if (channel !== "media") {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `${channel === "layout" ? "Layout" : "Text"} nodes select by versionId or index, not assetId.`,
        {
          missing: { args: ["versionId"] },
          suggestion: listSuggestion(),
        },
      );
    }
    const found = versions.indexOf(assetId);
    if (found < 0) {
      throw createToolError(
        TOOL_ERROR_CODE.ASSET_MISSING,
        `Asset ${assetId} is not among this node's results.`,
        {
          missing: { results: [assetId] },
          suggestion: listSuggestion(),
        },
      );
    }
    return found;
  }
  const numeric = Number(index);
  if (!Number.isInteger(numeric)) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      "index must be an integer (or pass versionId / assetId).",
      {
        missing: { args: ["index"] },
        suggestion: listSuggestion(),
      },
    );
  }
  if (numeric < 0 || numeric >= versions.length) {
    throw createToolError(
      TOOL_ERROR_CODE.INDEX_OUT_OF_RANGE,
      `Index ${numeric} is out of range (0..${Math.max(0, versions.length - 1)}).`,
      {
        missing: { index: [numeric] },
        suggestion: listSuggestion(),
      },
    );
  }
  return numeric;
}

const def = getWorkflowToolDefinition("pick_version");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const node = (store.nodes ?? []).find(
      (candidate) => candidate.id === args.nodeId,
    );
    if (!node) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Node not found: ${args.nodeId}`,
        {
          missing: { nodes: [args.nodeId] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Call list_nodes to get valid node ids, then retry.",
          },
        },
      );
    }

    const channel = channelOf(node);
    if (!channel) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Node type "${node.type}" keeps no version list — pick_version works on layout (imageAsset), text (prompt) and media (generate/video) nodes.`,
        {
          missing: { nodeData: ["layoutVersions | versions | results"] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Pick a node that holds generated versions, then retry.",
          },
        },
      );
    }

    const list =
      channel === "layout"
        ? node.data?.layoutVersions
        : channel === "text"
          ? node.data?.versions
          : node.data?.results;
    if (!Array.isArray(list) || list.length === 0) {
      throw createToolError(
        TOOL_ERROR_CODE.NO_VERSIONS,
        `Node ${args.nodeId} has no generated ${channel === "media" ? "results" : "versions"} yet.`,
        {
          missing: {
            nodeData: [
              channel === "media"
                ? "results"
                : channel === "layout"
                  ? "layoutVersions"
                  : "versions",
            ],
          },
          suggestion: noVersionsSuggestion(channel),
        },
      );
    }

    const selectors = givenSelector(args);
    if (selectors.length > 1) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Provide only one of versionId / index / assetId (got ${selectors.join(", ")}).`,
        {
          missing: { args: selectors },
          suggestion: listSuggestion(),
        },
      );
    }

    // Listing mode: no selector — report what is available.
    if (selectors.length === 0) {
      if (channel === "media") {
        return {
          nodeId: args.nodeId,
          channel,
          mode: "listed",
          count: list.length,
          selectedIndex: node.data?.selectedIndex ?? 0,
          versions: list.map((assetId, index) => ({ index, id: assetId })),
        };
      }
      return {
        nodeId: args.nodeId,
        channel,
        mode: "listed",
        count: list.length,
        selectedId:
          channel === "layout"
            ? node.data?.selectedLayoutVersionId
            : node.data?.selectedVersionId,
        versions: list.map((version, index) => ({
          index,
          id: version.id,
          preview:
            channel === "layout"
              ? htmlPreview(version.html)
              : String(version.text ?? "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 80),
        })),
      };
    }

    const index = resolveIndex(list, { ...args, channel });
    commitWorkflowHistory(store, "workflow.agent.version.select");

    if (channel === "layout") {
      const version = list[index];
      store.updateNodeData(args.nodeId, {
        selectedLayoutVersionId: version.id,
        layoutHtml: version.html,
        ...(version.meta?.designSystem
          ? { layoutResolvedDesignSystem: version.meta.designSystem }
          : {}),
        ...(version.meta?.artDirection
          ? { layoutResolvedArtDirection: version.meta.artDirection }
          : {}),
      });
      // Land the layers: the UI's version picker only swaps the raw HTML, so
      // the tool closes that gap by re-parsing through the store action the
      // generate_layout pipeline ends with.
      let parsed = false;
      if (typeof store.parseLayoutHtml === "function") {
        parsed = (await store.parseLayoutHtml(args.nodeId)) === true;
      }
      return {
        nodeId: args.nodeId,
        channel,
        versionId: version.id,
        index,
        parsed,
      };
    }

    if (channel === "text") {
      const version = list[index];
      store.updateNodeData(args.nodeId, {
        selectedVersionId: version.id,
        text: version.text,
      });
      return {
        nodeId: args.nodeId,
        channel,
        versionId: version.id,
        index,
        text: version.text,
      };
    }

    // Media: switch the active result and let pure editor / preview nodes fed from this
    // source follow the new pick.
    const assetId = list[index];
    store.updateNodeData(args.nodeId, { selectedIndex: index });
    const syncedEditorNodes = [];
    for (const candidate of store.nodes ?? []) {
      if (candidate.id === args.nodeId) continue;
      if (
        candidate.type !== NODE_TYPE.IMAGE_EDITOR &&
        candidate.type !== NODE_TYPE.PREVIEW
      ) {
        continue;
      }
      if (candidate.data?.sourceNodeId !== args.nodeId) continue;
      // A layout-driven editor node keeps its own document — do not clobber it.
      if (candidate.data?.layoutHtml || candidate.data?.editorDoc) continue;
      store.updateNodeData(candidate.id, {
        assetId,
        imageId: assetId,
      });
      syncedEditorNodes.push(candidate.id);
    }
    return {
      nodeId: args.nodeId,
      channel,
      index,
      assetId,
      syncedEditorNodes,
    };
  },

  presentCall(args) {
    return {
      title: `Pick version (${args.nodeId.slice(0, 8)}…)`,
      icon: "check",
    };
  },

  presentResult(_args, result) {
    if (!result) return { title: "Pick version" };
    if (result.mode === "listed") {
      return {
        title: `${result.count} version(s) available`,
        status: "completed",
      };
    }
    const label =
      result.channel === "layout"
        ? `Layout ${result.index + 1}`
        : result.channel === "text"
          ? `Text ${result.index + 1}`
          : `Result ${result.index + 1}`;
    return { title: `${label} selected`, status: "completed" };
  },
});
