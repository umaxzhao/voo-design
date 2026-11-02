// Weak identities keep journals out of documents, serialization and the default path.
const tracked = new WeakSet();
const journals = new WeakMap();
export const nodesTracked = nodes => tracked.has(nodes);
export function trackNodes(nodes) { tracked.add(nodes); }
export function journalNodes(before, after, supplied) {
  if (!tracked.has(before) || before === after) return;
  if (supplied) {
    journals.set(after, { before, changes: supplied });
    tracked.add(after);
    return;
  }
  const old = new Map(before.map((node, z) => [node.id, { node, z }]));
  const changes = [];
  after.forEach((node, z) => {
    const previous = old.get(node.id);
    if (previous?.node !== node || previous?.z !== z) changes.push({ node, z });
    old.delete(node.id);
  });
  for (const id of old.keys()) changes.push({ id, remove: true });
  journals.set(after, { before, changes });
  tracked.add(after);
}
export function changesSince(before, after) {
  const batches = [];
  const consumed = [];
  const visited = new Set();
  for (let current = after; current !== before;) {
    if (visited.has(current)) return null;
    visited.add(current);
    const journal = journals.get(current);
    if (!journal) return null;
    batches.push(journal.changes);
    consumed.push(current);
    current = journal.before;
  }
  for (const nodes of consumed) journals.delete(nodes);
  const merged = new Map();
  for (const batch of batches.reverse()) for (const op of batch) merged.set(op.id ?? op.node.id, op);
  return [...merged.values()];
}
