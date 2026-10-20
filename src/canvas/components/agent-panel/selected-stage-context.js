/** Compact graph context for continuing a workflow from selected stages. */
import { NODE_PORTS } from "../../nodes/node_enums.js";

function describeNeighbor(edge, byId, incoming) {
  const neighborId = incoming ? edge.source : edge.target;
  const neighbor = byId.get(neighborId);
  const route = `${edge.sourceHandle ?? "?"} → ${edge.targetHandle ?? "?"}`;
  return `${neighborId} [${neighbor?.type ?? "missing"}] (${route})`;
}

export function formatSelectedStageContext(canvasState) {
  const selected = canvasState?.selectedNodes ?? [];
  if (selected.length === 0) return "";

  const nodes = canvasState?.nodes ?? [];
  const edges = canvasState?.edges ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = ["## Selected Workflow Stage"];

  for (const item of selected.slice(0, 8)) {
    const node = byId.get(item.id);
    if (!node) continue;
    const data = node.data ?? {};
    const outputs = NODE_PORTS[node.type]?.source ?? [];
    const results = Array.isArray(data.results) ? data.results : [];
    const selectedIndex = data.selectedIndex ?? 0;
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const identity = [
      `- ${node.id} [${node.type}]`,
      `status=${data.status ?? "idle"}`,
      `outputs=${outputs.length > 0 ? outputs.join(",") : "none"}`,
      `results=${results.length}`,
    ];
    if (results.length > 0) identity.push(`activeResult=${selectedIndex}`);
    if (data.workflowRole) identity.push(`role=${data.workflowRole}`);
    if (data.assetElementKey) identity.push(`element=${data.assetElementKey}`);
    lines.push(identity.join("; "));
    lines.push(
      `  inputs: ${incoming.length > 0 ? incoming.map((edge) => describeNeighbor(edge, byId, true)).join("; ") : "none"}`,
      `  downstream: ${outgoing.length > 0 ? outgoing.map((edge) => describeNeighbor(edge, byId, false)).join("; ") : "none"}`,
    );
  }

  lines.push(
    "When the user asks to continue from this stage, use its exact node ID as the anchor. Call list_nodes for its current status, active result, and connections; use list_nodes with includeContent for text or observe_canvas for an image when needed. Continue from the current result, preserving earlier nodes and existing branches. Add a visible downstream branch with build_workflow attachTo or create_node edges, then run only the new or affected nodes requested by the user. If the selected node has no output port, inspect its concrete child/result node and anchor there. If its output cannot connect to the requested node type, use the nearest compatible upstream result for a sibling branch and explain that route. Never force an invalid edge. If no usable result exists, say what must be generated first rather than pretending the stage is complete.",
  );
  return lines.join("\n");
}
