/** Minimal scene document shared by snapping behavior tests. */
export function createTestDoc(nodes = [], guides = [], width = 1000, height = 800) {
  return { width, height, nodes, guides };
}
