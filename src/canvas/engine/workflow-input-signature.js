// Execution receipts and presentation state do not change a node's inputs.
const OUTPUT_FIELDS = new Set([
  "status",
  "stage",
  "error",
  "results",
  "selectedIndex",
  "versions",
  "selectedVersionId",
  "remoteJob",
  "webGeneration",
  "imageEntries",
  "galleryResults",
  "artifactCount",
  "lastBatchId",
  "lastSlotId",
  "inputSignature",
]);

const HASH_MASK = (1n << 64n) - 1n;
const HASH_PRIME = 1099511628211n;
const HASH_SEEDS = [14695981039346656037n, 7809847782465536322n];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([, entry]) => entry !== undefined && typeof entry !== "function",
        )
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function fingerprint(value) {
  const source = JSON.stringify(canonicalize(value));
  const hashes = HASH_SEEDS.map((seed) => {
    let hash = seed;
    for (let index = 0; index < source.length; index += 1) {
      hash =
        ((hash ^ BigInt(source.charCodeAt(index))) * HASH_PRIME) & HASH_MASK;
    }
    return hash.toString(16).padStart(16, "0");
  });
  return hashes.join("");
}

function inputData(node) {
  const data = Object.fromEntries(
    Object.entries(node.data ?? {}).filter(([key]) => !OUTPUT_FIELDS.has(key)),
  );
  // AI Prompt writes generated text into `text`. Its instruction is `aiPrompt`;
  // the generated text is an output for downstream nodes, not its own input.
  if (node.type === "prompt" && data.aiPrompt?.trim()) delete data.text;
  return data;
}

function outputData(node) {
  const data = node.data ?? {};
  const results = Array.isArray(data.results) ? data.results : [];
  const selectedResult = results[data.selectedIndex ?? 0] ?? results[0] ?? null;
  return {
    selectedResult,
    selectedVersionId: data.selectedVersionId ?? null,
    imageId: data.imageId ?? null,
    assetId: data.assetId ?? null,
    lastBatchId: data.lastBatchId ?? null,
    lastSlotId: data.lastSlotId ?? null,
    ...(node.type === "prompt" && data.aiPrompt?.trim()
      ? { text: data.text ?? null }
      : {}),
  };
}

/**
 * Compute the exact graph inputs a node currently sees. A source edit changes
 * every descendant's signature, while a new result also changes descendants
 * through the source's output identity. Canvas position and run status do not.
 */
export function createInputSignatureReader(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map();
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }
  const cache = new Map();
  const visiting = new Set();

  function read(nodeId) {
    if (cache.has(nodeId)) return cache.get(nodeId);
    const node = byId.get(nodeId);
    if (!node) throw new Error(`Cannot fingerprint missing node: ${nodeId}`);
    if (visiting.has(nodeId))
      throw new Error("Cannot fingerprint a cyclic workflow");
    visiting.add(nodeId);
    const sources = (incoming.get(nodeId) ?? [])
      .map((edge) => {
        const source = byId.get(edge.source);
        if (!source)
          throw new Error(`Cannot fingerprint missing source: ${edge.source}`);
        return {
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          inputSignature: read(edge.source),
          output: outputData(source),
        };
      })
      .sort((left, right) => {
        const first = JSON.stringify(left);
        const second = JSON.stringify(right);
        return first < second ? -1 : first > second ? 1 : 0;
      });
    // Image inputs are attached in canvas order, so only an order change
    // matters; moving one source without changing the order does not.
    const sourceOrder = (incoming.get(nodeId) ?? [])
      .map((edge) => byId.get(edge.source))
      .sort(
        (left, right) =>
          (left.position?.y ?? 0) - (right.position?.y ?? 0) ||
          (left.position?.x ?? 0) - (right.position?.x ?? 0) ||
          left.id.localeCompare(right.id),
      )
      .map((source) => source.id);
    visiting.delete(nodeId);
    const signature = fingerprint({
      type: node.type,
      data: inputData(node),
      sources,
      sourceOrder,
    });
    cache.set(nodeId, signature);
    return signature;
  }

  return read;
}
