/**
 * Subgraph templates (plan P3-1): turn a selected node subgraph into a
 * reusable, re-instantiable template.
 *
 * Two halves:
 *  - pure graph work: extractSubgraph slices the induced subgraph out of the
 *    workflow (internal edges kept, boundary edges declared as input/output
 *    ports), and instantiateSubgraph re-creates nodes/edges at a position
 *    with the declared ports rewired to caller-supplied external nodes.
 *  - a small localStorage store: subgraph templates are plain JSON (nodes +
 *    edges + port declarations, no blobs), so they fit localStorage and stay
 *    out of the IndexedDB schema.
 *
 * Port references are positional (index into the template's nodes array) so a
 * template survives node-id regeneration on instantiation.
 */

const STORAGE_KEY = "voo.subgraph-templates";

/** Node fields that must not ride inside a saved template (transient UI state). */
const TRANSIENT_NODE_FIELDS = [
  "selected",
  "dragging",
  "positionAbsolute",
  "width",
  "height",
  "measured",
];

function cleanNode(node) {
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (TRANSIENT_NODE_FIELDS.includes(key)) continue;
    if (key === "id") continue; // regenerated on instantiate
    out[key] = value;
  }
  return out;
}

/**
 * The induced subgraph over `selectedIds`, plus the boundary ports.
 *
 * @param {Array} nodes workflow nodes (each with `id`, `selected`, ...)
 * @param {Array} edges workflow edges ({source,target,sourceHandle,targetHandle})
 * @param {Set<string>} selectedIds node ids to include
 * @returns {{ nodes: Array, edges: Array, inputs: Array, outputs: Array }}
 */
export function extractSubgraph(nodes, edges, selectedIds) {
  const selected = new Set(selectedIds);
  const inside = nodes.filter((node) => selected.has(node.id));
  const indexOf = new Map(inside.map((node, index) => [node.id, index]));

  const internal = [];
  const inputs = []; // external -> selected (selected node is the target)
  const outputs = []; // selected -> external (selected node is the source)
  for (const edge of edges) {
    const sourceInside = indexOf.has(edge.source);
    const targetInside = indexOf.has(edge.target);
    if (sourceInside && targetInside) {
      // Positional references like the ports: template node ids are stripped,
      // so an edge must point at the node's index in the template's array.
      internal.push({
        ...edge,
        source: indexOf.get(edge.source),
        target: indexOf.get(edge.target),
      });
    } else if (targetInside) {
      inputs.push({
        node: indexOf.get(edge.target),
        handle: edge.targetHandle ?? null,
      });
    } else if (sourceInside) {
      outputs.push({
        node: indexOf.get(edge.source),
        handle: edge.sourceHandle ?? null,
      });
    }
  }

  // Clean nodes and fix up internal styleAnchorId references so they survive
  // node-ID regeneration on instantiation. References to nodes outside the
  // subgraph are kept as plain string IDs; internal ones become positional
  // sentinels { __tplNodeRef__: index } that instantiateSubgraph resolves.
  const cleanedNodes = inside.map((node) => {
    const clean = cleanNode(node);
    const anchorId = node.data?.styleAnchorId;
    if (!anchorId || typeof anchorId !== "string") return clean;
    const refIndex = indexOf.get(anchorId);
    if (refIndex === undefined) return clean; // external ref — keep as-is
    return {
      ...clean,
      data: { ...clean.data, styleAnchorId: { __tplNodeRef__: refIndex } },
    };
  });

  return {
    nodes: cleanedNodes,
    edges: internal,
    inputs,
    outputs,
  };
}

/** Serializes a subgraph plus a name into a portable template document. */
export function serialiseSubgraphTemplate(subgraph, name) {
  return {
    version: 1,
    kind: "subgraph",
    name,
    createdAt: Date.now(),
    ...subgraph,
  };
}

/**
 * Re-creates the template's nodes/edges at `position`, regenerating ids.
 * Ports listed in `inputRewire`/`outputRewire` (maps of {port, nodeId,
 * handle}) connect the declared template ports to external nodes.
 *
 * @returns {{ nodes: Array, edges: Array }} ready to merge into the store.
 */
export function instantiateSubgraph(
  template,
  position = { x: 0, y: 0 },
  rewires = {},
) {
  const instanceId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  const idFor = new Map();
  const nodes = (template.nodes ?? []).map((clean, index) => {
    const id = `tpl-${template.name ?? "subgraph"}-${instanceId}-${index}`;
    idFor.set(index, id);
    return { ...clean, id, data: { ...(clean.data ?? {}) } };
  });

  // Second pass: resolve internal styleAnchorId sentinels now that all IDs
  // are known. External refs (plain strings) are left unchanged.
  for (const node of nodes) {
    const sa = node.data?.styleAnchorId;
    if (sa !== null && typeof sa === "object" && "__tplNodeRef__" in sa) {
      node.data.styleAnchorId = idFor.get(sa.__tplNodeRef__) ?? null;
    }
  }

  const edges = (template.edges ?? [])
    .map((edge, index) => {
      const source = idFor.get(edge.source);
      const target = idFor.get(edge.target);
      if (!source || !target) return null;
      return { ...edge, id: `tpl-edge-${instanceId}-${index}`, source, target };
    })
    .filter(Boolean);

  // Place the template's bounding box at `position` (top-left anchor).
  if (nodes.length > 0) {
    const minX = Math.min(...nodes.map((node) => node.position?.x ?? 0));
    const minY = Math.min(...nodes.map((node) => node.position?.y ?? 0));
    for (const node of nodes) {
      node.position = {
        x: position.x + (node.position?.x ?? 0) - minX,
        y: position.y + (node.position?.y ?? 0) - minY,
      };
    }
  }

  const wirePorts = (ports, rewireMap) => {
    for (const port of ports ?? []) {
      const rewire = rewireMap?.find(
        (entry) => entry.port === port.node && entry.handle === port.handle,
      );
      const nodeId = idFor.get(port.node);
      if (!nodeId || !rewire?.nodeId) continue;
      if (rewire.direction === "out") {
        edges.push({
          id: `tpl-rewire-${instanceId}-${edges.length}`,
          source: nodeId,
          target: rewire.nodeId,
          sourceHandle: port.handle ?? null,
          targetHandle: rewire.handle ?? null,
        });
      } else {
        edges.push({
          id: `tpl-rewire-${instanceId}-${edges.length}`,
          source: rewire.nodeId,
          target: nodeId,
          sourceHandle: rewire.handle ?? null,
          targetHandle: port.handle ?? null,
        });
      }
    }
  };
  wirePorts(template.outputs, rewires.outputs);
  wirePorts(template.inputs, rewires.inputs);

  return { nodes, edges };
}

// ── localStorage store ────────────────────────────────────────────────────────

/** Saves a serialised template under its name (localStorage, best-effort). */
export function saveSubgraphTemplate(template) {
  const all = listSubgraphTemplates();
  all[template.name] = template;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Returns all saved templates keyed by name. */
export function listSubgraphTemplates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Loads one template by name, or null. */
export function loadSubgraphTemplate(name) {
  return listSubgraphTemplates()[name] ?? null;
}
