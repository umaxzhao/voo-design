import { commitAssetExpansion } from "./agent-asset-transaction.js";
import { ICONS } from "./html_pipeline/lucide.js";
import { parseSvgToNodes } from "./svg_to_nodes.js";
import { searchStock } from "./stock-search.js";
import { TOOL_ERROR, assetTargetGuard, requireEditor, invalidArgs, toolError, finiteOrNull, placementFor, createVectorNodes } from "./canvas-asset-shared.js";
/* ------------------------------------------------------------------ stock_image */

export const STOCK_IMAGE_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "stock_image",
    description: "Search Openverse, with Wikimedia Commons fallback, for an openly licensed photo matching a query and place it on the canvas. Network required. " + "Returns {layerIds, attributions}. Query with 1-4 concrete nouns, not abstract concepts.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Concrete search terms, e.g. \"fern frond macro\"."
        },
        count: {
          type: "number",
          description: "1-4 images (default 1)."
        },
        x: {
          type: "number"
        },
        y: {
          type: "number"
        },
        width: {
          type: "number"
        },
        height: {
          type: "number"
        }
      },
      required: ["query"]
    }
  }
});
export async function stockImage(args = {}, context = {}) {
  const editor = requireEditor();
  const assertTarget = assetTargetGuard(editor, context.signal);
  const query = String(args.query ?? "").trim();
  if (!query) invalidArgs(TOOL_ERROR.INVALID_ARGS, "query is required.");
  const count = Math.max(1, Math.min(4, Math.trunc(finiteOrNull(args.count) ?? 1)));
  const fetchImpl = context.fetch ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, "fetch is unavailable in this environment.");
  const { results, warnings: searchWarnings, source } = await searchStock(query, count, { fetch: fetchImpl, signal: context.signal });
  const layerIds = [];
  const attributions = [];
  const preparedEntries = [];
  const warnings = [...searchWarnings];
  const base = {
    x: finiteOrNull(args.x) ?? placementFor(editor, 400, 300).x,
    y: finiteOrNull(args.y) ?? 0
  };
  for (const [index, item] of results.entries()) {
    // Preview-sized stock avoids decoding the original multi-megapixel upload for a small insertion.
    const url = item.thumbnail ?? item.url;
    try {
      const prepared = editor.prepareImageInsertion ? await editor.prepareImageInsertion(url) : null;
      assertTarget();
      const node = prepared ? null : await editor.insertImage?.(url);
      if (!prepared && !node?.id) throw new Error("Image insertion is unavailable");
      const patch = {
        x: base.x + index * ((finiteOrNull(args.width) ?? 400) + 24),
        y: base.y,
        ...(finiteOrNull(args.width) ? {
          width: args.width
        } : {}),
        ...(finiteOrNull(args.height) ? {
          height: args.height
        } : {}),
        name: item.title?.slice(0, 80) || `Stock: ${query}`
      };
      if (prepared) preparedEntries.push({
        prepared,
        patch
      });else {
        editor.updateNode?.(node.id, patch);
        layerIds.push(node.id);
      }
      attributions.push({
        title: item.title ?? "",
        creator: item.creator ?? "",
        license: item.license ?? "",
        source: item.foreign_landing_url ?? item.url ?? ""
      });
    } catch (error) {
      assertTarget();
      warnings.push({
        url,
        reason: error?.message ?? String(error)
      });
    }
  }
  assertTarget();
  if (preparedEntries.length) {
    layerIds.push(...editor.insertPreparedImages(preparedEntries, "AI: Place stock image").map(node => node.id));
  }
  if (!layerIds.length) throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, `Could not download any result image. ${warnings.map(item => item.reason).join("; ")}`);
  if (!preparedEntries.length) editor.commitEditorDocument?.({
    message: "AI: Place stock image"
  });
  return {
    ok: true,
    layerIds,
    attributions,
    warnings,
    source
  };
}

/* ------------------------------------------------------------------ create_icon */

export const CREATE_ICON_SCHEMA = Object.freeze({
  type: "function",
  function: {
    name: "create_icon",
    description: "Insert an editable vector icon from the built-in icon set (e.g. 'search', 'settings', 'user', 'bell', 'heart', 'download', 'chevron-right', 'arrow-left', etc.) onto the canvas.",
    parameters: {
      type: "object",
      properties: {
        icon: {
          type: "string",
          description: "Icon name, e.g. 'search', 'home', 'user', 'settings', 'bell', 'mail', 'heart', 'folder', 'plus'."
        },
        x: {
          type: "number",
          description: "Canvas x position (optional; defaults to next available space)."
        },
        y: {
          type: "number",
          description: "Canvas y position (optional; defaults to 0)."
        },
        size: {
          type: "number",
          description: "Icon size in pixels (default 24)."
        },
        color: {
          type: "string",
          description: "Icon stroke color, e.g. '#ffffff' or '#171717'."
        },
        strokeWidth: {
          type: "number",
          description: "Icon stroke width in pixels (default 2)."
        },
        name: {
          type: "string",
          description: "Optional layer name."
        }
      },
      required: ["icon"]
    }
  }
});
export async function createIcon(args = {}, context = {}) {
  context.signal?.throwIfAborted();
  const iconName = String(args.icon ?? "").toLowerCase().trim();
  const iconData = ICONS[iconName];
  if (!iconData) {
    invalidArgs(TOOL_ERROR.INVALID_ARGS, `Unknown icon: "${iconName}". Available icons include: ${Object.keys(ICONS).slice(0, 15).join(", ")}...`);
  }
  const editor = context.editor ?? requireEditor();
  const size = Math.max(8, Number(args.size) || 24);
  const color = typeof args.color === "string" ? args.color : "#ffffff";
  const strokeWidth = Number.isFinite(Number(args.strokeWidth)) ? Number(args.strokeWidth) : 2;
  const origin = Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y)) ? {
    x: Number(args.x),
    y: Number(args.y)
  } : placementFor(editor, size, size);
  const body = iconData.node.map(([tag, attrs]) => {
    const attrsStr = Object.entries(attrs).filter(([key]) => key !== "key").map(([k, v]) => `${k}="${v}"`).join(" ");
    return `<${tag} ${attrsStr}></${tag}>`;
  }).join("");
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const parsed = parseSvgToNodes(svgText, {
    targetWidth: size,
    targetHeight: size
  });
  return commitAssetExpansion(editor, () => {
    const layerIds = createVectorNodes(editor, parsed.nodes, origin);
    if (args.name && layerIds.length > 0) {
      editor.updateNode?.(layerIds[0], {
        name: args.name
      });
    }
    return {
      ok: true,
      icon: iconName,
      size,
      x: origin.x,
      y: origin.y,
      layerIds
    };
  }, `AI: Insert icon ${iconName}`);
}
