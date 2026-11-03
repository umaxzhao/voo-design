const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = items => new Map((Array.isArray(items) ? items : []).map(item => [item.id, item]));
const pick = (base, local, remote) => equal(local, base) ? remote : local;

/** Replies are append-only in the comment model; a stale peer cannot delete them. */
function mergeMessages(base, local, remote) {
  const old = byId(base), left = byId(local), right = byId(remote);
  const ids = new Set([...left.keys(), ...right.keys()]);
  return [...ids].map(id => {
    if (!left.has(id)) return right.get(id);
    if (!right.has(id)) return left.get(id);
    return pick(old.get(id), left.get(id), right.get(id));
  }).sort((a, b) => {
    const time = (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    if (time) return time;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
}

function mergeThread(base, local, remote) {
  const merged = {};
  for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(remote)])) {
    merged[key] = key === "messages"
      ? mergeMessages(base?.messages, local.messages, remote.messages)
      : pick(base?.[key], local[key], remote[key]);
  }
  return merged;
}

/** Preserve thread deletion semantics and merge replies independently by ID. */
export function mergeComments(base, local, remote) {
  if (local === undefined && remote === undefined) return undefined;
  const old = byId(base), left = byId(local), right = byId(remote), result = [];
  for (const [id, value] of left) {
    if (right.has(id)) result.push(mergeThread(old.get(id), value, right.get(id)));
    else if (!old.has(id)) result.push(value);
  }
  for (const [id, value] of right) if (!left.has(id) && !old.has(id)) result.push(value);
  return result;
}
