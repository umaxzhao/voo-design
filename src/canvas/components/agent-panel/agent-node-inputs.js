/** Summarizes wired inputs for the node-bound Agent session. */
export function formatAgentNodeInputs(agentNodeId, nodes = [], edges = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = edges.filter((edge) => edge.target === agentNodeId);
  if (incoming.length === 0) return "No upstream material is connected.";

  const lines = [
    "Connected inputs (use source handles to determine each material's type):",
  ];
  for (const edge of incoming) {
    const source = byId.get(edge.source);
    if (!source) continue;
    const data = source.data ?? {};
    const values = Array.isArray(data.results) ? data.results : [];
    const selected = values[data.selectedIndex ?? 0] ?? values[0];
    const assetId = data.imageId ?? selected;
    const text = data.prompt ?? data.aiPrompt ?? data.text;
    const parts = [
      `${edge.sourceHandle ?? "unknown"} from ${source.id} [${source.type}]`,
    ];
    if (data.label) parts.push(`name: ${String(data.label).slice(0, 80)}`);
    if (typeof assetId === "string" && assetId) {
      parts.push(`assetId: ${assetId}`);
    }
    if (typeof text === "string" && text.trim()) {
      parts.push(`text: ${JSON.stringify(text.trim().slice(0, 300))}`);
    }
    lines.push(`- ${parts.join("; ")}`);
  }
  lines.push(
    "Treat these nodes as the session's reference material. Inspect their current results with list_nodes before using an asset ID in a generation tool.",
  );
  return lines.join("\n");
}
