// Attribute sampled wall time to JS stacks, including native calls charged to
// their JS caller. This is diagnostic evidence, separate from FPS samples.
export function summarizeCpuProfile(profile, limit = 15) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  const self = new Map(), inclusive = new Map();
  let totalUs = 0;
  for (let i = 0; i < (profile.samples ?? []).length; i++) {
    const id = profile.samples[i], us = profile.timeDeltas?.[i] ?? 0;
    totalUs += us;
    self.set(id, (self.get(id) ?? 0) + us);
    for (let ancestor = id; ancestor != null; ancestor = parents.get(ancestor)) {
      inclusive.set(ancestor, (inclusive.get(ancestor) ?? 0) + us);
    }
  }
  const rows = [...nodes.values()].map(node => ({
    function: node.callFrame.functionName || '(anonymous)',
    url: node.callFrame.url,
    line: node.callFrame.lineNumber + 1,
    selfMs: +((self.get(node.id) ?? 0) / 1000).toFixed(2),
    inclusiveMs: +((inclusive.get(node.id) ?? 0) / 1000).toFixed(2),
  }));
  return { durationMs: +(totalUs / 1000).toFixed(2),
    self: [...rows].sort((a, b) => b.selfMs - a.selfMs).slice(0, limit),
    inclusive: rows.filter(row => row.url).sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, limit) };
}
