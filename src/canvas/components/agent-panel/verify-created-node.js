/**
 * Verifies create_node outcomes: asserts that the created node exists on canvas,
 * and matches the requested type and parameters.
 *
 * @param {Object} args
 * @param {Object} result
 * @param {Function} observe
 * @param {Object} [context]
 * @returns {Promise<{ ok: boolean, issues: Array<Object> }>}
 */
export async function verifyCreateNode(args, result, observe, context = {}) {
  const issues = [];
  const store = context?.getStore ? context.getStore() : context?.store;

  // 1. Batch creation verification
  if (Array.isArray(args?.nodes)) {
    // create_node returns nodes keyed by ref, not createdNodes. Reading the
    // wrong field falsely failed a committed batch and made the Agent clone it.
    const createdList = result?.nodes || result?.createdNodes || [];
    if (createdList.length !== args.nodes.length) {
      issues.push({
        id: "verify_batch_count_mismatch",
        targetType: "canvas",
        targetId: "batch",
        rule: "batch_count",
        severity: "error",
        evidence: `Batch create requested ${args.nodes.length} nodes, but ${createdList.length} were returned.`,
        suggestion: "Ensure all nodes in the batch are instantiated.",
      });
    }
    for (const [index, requested] of args.nodes.entries()) {
      const created = requested.ref
        ? createdList.find((entry) => entry.ref === requested.ref)
        : createdList[index];
      const verified = await verifyCreateNode(
        requested,
        { nodeId: created?.nodeId || created?.id },
        observe,
        context,
      );
      issues.push(...verified.issues);
    }
    return { ok: issues.length === 0, issues };
  }

  // 2. Single node creation verification
  const nodeId = result?.nodeId || result?.id || args?.nodeId;
  if (!nodeId) {
    issues.push({
      id: "verify_node_missing_id",
      targetType: "node",
      targetId: "unknown",
      rule: "node_id_returned",
      severity: "error",
      evidence: "create_node completed without returning a valid nodeId.",
      suggestion: "Return the instantiated nodeId in the tool result.",
    });
    return { ok: false, issues };
  }

  // Locate the node on the canvas
  let node = store?.nodes?.find?.((n) => String(n.id) === String(nodeId));
  if (!node && typeof observe === "function") {
    try {
      const obs = await observe({
        scope: "viewport",
        targetIds: [String(nodeId)],
      });
      if (obs?.objects?.[0]) {
        node = obs.objects[0];
      }
    } catch {
      // ignore
    }
  }

  if (!node) {
    issues.push({
      id: `verify_node_not_found_${nodeId}`,
      targetType: "node",
      targetId: String(nodeId),
      rule: "node_exists",
      severity: "error",
      evidence: `Node ${nodeId} was reported created, but does not exist in the canvas store.`,
      suggestion:
        "Ensure the node was added to the canvas store with store.addNode.",
    });
    return { ok: false, issues };
  }

  // Verify node type
  if (args.type && node.type !== args.type && node.kind !== args.type) {
    issues.push({
      id: `verify_node_type_mismatch_${nodeId}`,
      targetType: "node",
      targetId: String(nodeId),
      rule: "node_type_match",
      severity: "error",
      evidence: `Node ${nodeId} type mismatch: requested '${args.type}', but found '${node.type || node.kind}'.`,
      suggestion: `Instantiate node with matching type '${args.type}'.`,
    });
  }

  // Verify node position if specified
  if (args.position && typeof args.position === "object") {
    const pos = node.position || { x: node.x, y: node.y };
    const dx = Math.abs(Number(pos.x ?? 0) - Number(args.position.x ?? 0));
    const dy = Math.abs(Number(pos.y ?? 0) - Number(args.position.y ?? 0));
    if (dx > 10 || dy > 10) {
      issues.push({
        id: `verify_node_pos_mismatch_${nodeId}`,
        targetType: "node",
        targetId: String(nodeId),
        rule: "node_position_match",
        severity: "error",
        evidence: `Node ${nodeId} position (${pos.x}, ${pos.y}) deviates significantly from requested (${args.position.x}, ${args.position.y}).`,
        suggestion: "Place the node at the requested coordinates.",
      });
    }
  }

  // Verify node data attributes if specified
  if (args.data && typeof args.data === "object") {
    const nodeData = node.data || node.properties || {};
    for (const [key, expectedVal] of Object.entries(args.data)) {
      const actualVal = nodeData[key];
      if (
        actualVal !== undefined &&
        expectedVal !== undefined &&
        actualVal !== expectedVal
      ) {
        issues.push({
          id: `verify_node_data_${key}_${nodeId}`,
          targetType: "node",
          targetId: String(nodeId),
          rule: "node_data_match",
          severity: "error",
          evidence: `Node ${nodeId} data.${key} mismatch: expected '${expectedVal}', got '${actualVal}'.`,
          suggestion: `Set node data.${key} to '${expectedVal}'.`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
