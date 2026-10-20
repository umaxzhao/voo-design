/**
 * Port, handle and topology resolution helpers for workflow specifications.
 */

import { HANDLE, NODE_PORTS, NODE_TYPE, nodeHasPort } from "../../../nodes/node_enums.js";
import { isValidConnection } from "../../../nodes/node_factory.js";

/**
 * Parses an endpoint string in 'ref[.port]' format.
 *
 * @param {string} endpointStr
 * @returns {{ ref: string, port: string|null, invalid: boolean }}
 */
export function parseEndpoint(endpointStr) {
  if (typeof endpointStr !== "string" || endpointStr.trim() === "") {
    return { ref: "", port: null, invalid: true };
  }
  const trimmed = endpointStr.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0 && lastDot < trimmed.length - 1) {
    return {
      ref: trimmed.slice(0, lastDot),
      port: trimmed.slice(lastDot + 1),
      invalid: false,
    };
  }
  return {
    ref: trimmed,
    port: null,
    invalid: false,
  };
}

/**
 * Resolves a default or compatible source handle on a node.
 */
export function resolveSourceHandle(node, specifiedPort, targetNode, targetPort) {
  const allowed = NODE_PORTS[node.type]?.source || [];
  if (specifiedPort) {
    if (!nodeHasPort(node, "source", specifiedPort)) {
      return {
        ok: false,
        error: `Node "${node.id || node.ref}" (${node.type}) does not have source port "${specifiedPort}". Available: [${allowed.join(", ")}].`,
      };
    }
    return { ok: true, handle: specifiedPort };
  }
  if (allowed.length === 0) {
    return {
      ok: false,
      error: `Node "${node.id || node.ref}" (${node.type}) has no output/source ports.`,
    };
  }
  if (allowed.length === 1) {
    return { ok: true, handle: allowed[0] };
  }
  if (targetNode && targetPort) {
    const compatible = allowed.filter((h) =>
      isValidConnection({
        source: node.id || node.ref,
        target: targetNode.id || targetNode.ref,
        sourceHandle: h,
        targetHandle: targetPort,
      }),
    );
    if (compatible.length === 1) {
      return { ok: true, handle: compatible[0] };
    }
  }
  return {
    ok: false,
    error: `Source port for node "${node.id || node.ref}" (${node.type}) is ambiguous and must be specified. Available: [${allowed.join(", ")}].`,
  };
}

/**
 * Resolves a default or compatible target handle on a node.
 */
export function resolveTargetHandle(node, specifiedPort, sourceNode, sourceHandle) {
  const allowed = NODE_PORTS[node.type]?.target || [];
  if (specifiedPort) {
    if (!nodeHasPort(node, "target", specifiedPort)) {
      return {
        ok: false,
        error: `Node "${node.id || node.ref}" (${node.type}) does not have target port "${specifiedPort}". Available: [${allowed.join(", ")}].`,
      };
    }
    return { ok: true, handle: specifiedPort };
  }
  if (allowed.length === 0) {
    return {
      ok: false,
      error: `Node "${node.id || node.ref}" (${node.type}) has no input/target ports.`,
    };
  }
  if (allowed.length === 1) {
    return { ok: true, handle: allowed[0] };
  }
  if (node.type === NODE_TYPE.GROUP || allowed.includes(HANDLE.MEDIA)) {
    return { ok: true, handle: HANDLE.MEDIA };
  }
  if (sourceHandle && allowed.includes(sourceHandle)) {
    return { ok: true, handle: sourceHandle };
  }
  if (
    sourceHandle === HANDLE.VIDEO &&
    allowed.includes(HANDLE.IMAGE) &&
    !allowed.includes(HANDLE.VIDEO)
  ) {
    return { ok: true, handle: HANDLE.IMAGE };
  }
  if (
    sourceHandle === HANDLE.IMAGE &&
    allowed.includes(HANDLE.VIDEO) &&
    !allowed.includes(HANDLE.IMAGE)
  ) {
    return { ok: true, handle: HANDLE.VIDEO };
  }
  return {
    ok: false,
    error: `Target port for node "${node.id || node.ref}" (${node.type}) is ambiguous and must be specified. Available: [${allowed.join(", ")}].`,
  };
}

/**
 * Validates connection compatibility between source and target handles.
 */
export function checkPortCompatibility(sourceNode, targetNode, sourceHandle, targetHandle) {
  const valid = isValidConnection({
    source: sourceNode.id || sourceNode.ref,
    target: targetNode.id || targetNode.ref,
    sourceHandle,
    targetHandle,
  });
  if (!valid) {
    return {
      ok: false,
      error: `Incompatible connection between "${sourceNode.type}.${sourceHandle}" and "${targetNode.type}.${targetHandle}".`,
    };
  }
  return { ok: true };
}

/**
 * Checks for directed cycles using DFS.
 */
export function detectCycle(allEdges) {
  const adjacency = new Map();
  for (const edge of allEdges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source).push(edge.target);
  }

  const state = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
  let cyclePath = null;

  function dfs(u, path) {
    state.set(u, 1);
    path.push(u);

    const neighbors = adjacency.get(u) || [];
    for (const v of neighbors) {
      if (state.get(v) === 1) {
        const cycleStart = path.indexOf(v);
        cyclePath = [...path.slice(cycleStart), v];
        return true;
      }
      if (!state.has(v) || state.get(v) === 0) {
        if (dfs(v, path)) return true;
      }
    }

    path.pop();
    state.set(u, 2);
    return false;
  }

  for (const node of adjacency.keys()) {
    if (!state.has(node) || state.get(node) === 0) {
      if (dfs(node, [])) {
        return cyclePath;
      }
    }
  }
  return null;
}

/**
 * Resolves an attachment edge between an existing node and new workflow nodes.
 */
export function resolveAttachToEdge(attachNode, attachPort, normalizedNodes) {
  const attachSourcePorts = NODE_PORTS[attachNode.type]?.source || [];
  const isSourceAttach = attachPort
    ? nodeHasPort(attachNode, "source", attachPort)
    : attachSourcePorts.length > 0;

  if (isSourceAttach) {
    const sHandle = attachPort || attachSourcePorts[0];
    for (const targetNode of normalizedNodes) {
      const targetAllowed = NODE_PORTS[targetNode.type]?.target || [];
      for (const tHandle of targetAllowed) {
        const comp = checkPortCompatibility(attachNode, targetNode, sHandle, tHandle);
        if (comp.ok) {
          return {
            ok: true,
            edge: {
              from: `${attachNode.id}.${sHandle}`,
              to: `${targetNode.ref}.${tHandle}`,
            },
          };
        }
      }
    }
  } else {
    const attachTargetPorts = NODE_PORTS[attachNode.type]?.target || [];
    const tHandle =
      attachPort ||
      (attachNode.type === NODE_TYPE.GROUP ? HANDLE.MEDIA : attachTargetPorts[0]);
    for (let i = normalizedNodes.length - 1; i >= 0; i--) {
      const sourceNode = normalizedNodes[i];
      const sourceAllowed = NODE_PORTS[sourceNode.type]?.source || [];
      for (const sHandle of sourceAllowed) {
        const comp = checkPortCompatibility(sourceNode, attachNode, sHandle, tHandle);
        if (comp.ok) {
          return {
            ok: true,
            edge: {
              from: `${sourceNode.ref}.${sHandle}`,
              to: `${attachNode.id}.${tHandle}`,
            },
          };
        }
      }
    }
  }

  return {
    ok: false,
    error: `Cannot attach node "${attachNode.id}" (${attachNode.type}) to any compatible node in the workflow.`,
  };
}

