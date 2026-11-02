/** Fixed-capacity indexed min heap used by the bounded Live Wire solver. */

export function createIndexedMinHeap(capacity) {
  const nodes = new Int32Array(capacity);
  const costs = new Float32Array(capacity);
  const positions = new Int32Array(capacity);
  positions.fill(-1);
  let size = 0;

  const swap = (left, right) => {
    const node = nodes[left];
    const cost = costs[left];
    nodes[left] = nodes[right];
    costs[left] = costs[right];
    nodes[right] = node;
    costs[right] = cost;
    positions[nodes[left]] = left;
    positions[nodes[right]] = right;
  };

  const bubbleUp = (start) => {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (costs[parent] <= costs[index]) break;
      swap(parent, index);
      index = parent;
    }
  };

  const bubbleDown = (start) => {
    let index = start;
    while (index < size) {
      const left = index * 2 + 1;
      if (left >= size) return;
      const right = left + 1;
      const child = right < size && costs[right] < costs[left] ? right : left;
      if (costs[index] <= costs[child]) return;
      swap(index, child);
      index = child;
    }
  };

  return {
    pushOrDecrease(node, cost) {
      const existing = positions[node];
      if (existing >= 0) {
        if (cost >= costs[existing]) return;
        costs[existing] = cost;
        bubbleUp(existing);
        return;
      }
      nodes[size] = node;
      costs[size] = cost;
      positions[node] = size;
      bubbleUp(size);
      size += 1;
    },
    pop() {
      if (size === 0) return null;
      const node = nodes[0];
      const cost = costs[0];
      positions[node] = -1;
      size -= 1;
      if (size > 0) {
        nodes[0] = nodes[size];
        costs[0] = costs[size];
        positions[nodes[0]] = 0;
        bubbleDown(0);
      }
      return { node, cost };
    },
    get size() {
      return size;
    },
  };
}
