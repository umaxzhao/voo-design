const handoffs = new WeakSet();

/** Navigation finishes a live edit before taking its pointer; OS cancellation rolls it back. */
export function dispatchPointerHandoff(target, event) {
  handoffs.add(event);
  try { return target.dispatchEvent(event); }
  finally { handoffs.delete(event); }
}

export function isPointerHandoff(event) {
  return handoffs.has(event?.nativeEvent ?? event);
}
