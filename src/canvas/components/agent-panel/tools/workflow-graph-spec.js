/**
 * Pure validator module for workflow graph specifications.
 *
 * Validates graph structure, node types, unique refs, endpoint resolution,
 * port type compatibility, and directed acyclic graph (DAG) topology
 * before mutating canvas state.
 */

import { CREATE_NODE_TYPES } from "./tool_descriptor.js";
import { TOOL_ERROR_CODE, createToolError } from "./errors.js";
import {
  parseEndpoint,
  resolveSourceHandle,
  resolveTargetHandle,
  checkPortCompatibility,
  detectCycle,
  resolveAttachToEdge,
} from "./workflow-graph-ports.js";

export { parseEndpoint };

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Pure inspection of a workflow specification against existing canvas nodes/edges.
 * Returns structured results without mutating any state and without throwing.
 *
 * @param {Object} input - { nodes, edges, attachTo, run }
 * @param {Array} existingNodes - Current canvas nodes
 * @param {Array} existingEdges - Current canvas edges
 * @returns {{ ok: boolean, errors: Array, normalizedNodes: Array, resolvedEdges: Array }}
 */
export function inspectWorkflowSpec(input, existingNodes = [], existingEdges = []) {
  const errors = [];
  const existingNodesMap = new Map(existingNodes.map((n) => [n.id, n]));
  const existingNodeIds = new Set(existingNodes.map((n) => n.id));

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        {
          code: TOOL_ERROR_CODE.ARGS_INVALID,
          message: "Workflow specification must be an object.",
          field: "input",
        },
      ],
      normalizedNodes: [],
      resolvedEdges: [],
    };
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: TOOL_ERROR_CODE.ARGS_INVALID,
          message: "nodes must be a non-empty array.",
          field: "nodes",
        },
      ],
      normalizedNodes: [],
      resolvedEdges: [],
    };
  }

  const normalizedNodes = [];
  const newNodesByRef = new Map();
  const seenRefs = new Set();

  input.nodes.forEach((item, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(item)) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path} must be a node object.`,
        field: path,
      });
      return;
    }
    if (typeof item.ref !== "string" || item.ref.trim() === "") {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path}.ref must be a non-empty string.`,
        field: `${path}.ref`,
      });
      return;
    }
    if (seenRefs.has(item.ref)) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `Duplicate node ref "${item.ref}" at ${path}.`,
        field: `${path}.ref`,
      });
    }
    seenRefs.add(item.ref);

    if (existingNodeIds.has(item.ref)) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `Node ref "${item.ref}" conflicts with an existing canvas node id.`,
        field: `${path}.ref`,
      });
    }

    if (!CREATE_NODE_TYPES.includes(item.type)) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `Node type "${item.type}" at ${path} is not supported. Supported: [${CREATE_NODE_TYPES.join(", ")}].`,
        field: `${path}.type`,
      });
    }

    if (item.position !== undefined) {
      if (
        !isRecord(item.position) ||
        !Number.isFinite(item.position.x) ||
        !Number.isFinite(item.position.y)
      ) {
        errors.push({
          code: TOOL_ERROR_CODE.ARGS_INVALID,
          message: `${path}.position must contain finite x and y coordinates.`,
          field: `${path}.position`,
        });
      }
    }

    if (item.data !== undefined && !isRecord(item.data)) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path}.data must be an object when provided.`,
        field: `${path}.data`,
      });
    }

    const normalized = {
      ref: item.ref,
      type: item.type,
      ...(item.position ? { position: { ...item.position } } : {}),
      ...(item.label !== undefined ? { label: item.label } : {}),
      ...(item.data ? { data: { ...item.data } } : {}),
    };
    normalizedNodes.push(normalized);
    newNodesByRef.set(item.ref, normalized);
  });

  const getNode = (refOrId) => newNodesByRef.get(refOrId) || existingNodesMap.get(refOrId) || null;

  const rawEdges = Array.isArray(input.edges) ? [...input.edges] : [];

  // Handle attachTo
  if (input.attachTo !== undefined) {
    if (!isRecord(input.attachTo) || typeof input.attachTo.nodeId !== "string" || !input.attachTo.nodeId.trim()) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: "attachTo must contain a non-empty nodeId.",
        field: "attachTo",
      });
    } else {
      const attachNode = existingNodesMap.get(input.attachTo.nodeId);
      if (!attachNode) {
        errors.push({
          code: TOOL_ERROR_CODE.NODE_NOT_FOUND,
          message: `Cannot attach to node "${input.attachTo.nodeId}": node not found on canvas.`,
          field: "attachTo.nodeId",
        });
      } else {
        const attachPort = input.attachTo.port ? String(input.attachTo.port).trim() : null;
        const attachRes = resolveAttachToEdge(attachNode, attachPort, normalizedNodes);
        if (attachRes.ok) {
          rawEdges.push(attachRes.edge);
        } else {
          errors.push({
            code: TOOL_ERROR_CODE.PORT_MISMATCH,
            message: attachRes.error,
            field: "attachTo",
          });
        }
      }
    }
  }

  const resolvedEdges = [];
  const edgeSignatures = new Set();

  rawEdges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path} must be an object with string "from" and "to" properties.`,
        field: path,
      });
      return;
    }

    const fromParsed = parseEndpoint(edge.from);
    const toParsed = parseEndpoint(edge.to);

    if (fromParsed.invalid) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path}.from is invalid: "${edge.from}".`,
        field: `${path}.from`,
      });
      return;
    }
    if (toParsed.invalid) {
      errors.push({
        code: TOOL_ERROR_CODE.ARGS_INVALID,
        message: `${path}.to is invalid: "${edge.to}".`,
        field: `${path}.to`,
      });
      return;
    }

    const sourceNode = getNode(fromParsed.ref);
    const targetNode = getNode(toParsed.ref);

    if (!sourceNode) {
      errors.push({
        code: TOOL_ERROR_CODE.NODE_NOT_FOUND,
        message: `${path}.from references unknown node "${fromParsed.ref}".`,
        field: `${path}.from`,
      });
    }
    if (!targetNode) {
      errors.push({
        code: TOOL_ERROR_CODE.NODE_NOT_FOUND,
        message: `${path}.to references unknown node "${toParsed.ref}".`,
        field: `${path}.to`,
      });
    }

    if (!sourceNode || !targetNode) return;

    if (fromParsed.ref === toParsed.ref) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `Self-connection is forbidden at ${path}: "${fromParsed.ref}".`,
        field: path,
      });
      return;
    }

    const sRes = resolveSourceHandle(sourceNode, fromParsed.port, targetNode, toParsed.port);
    if (!sRes.ok) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `${path}: ${sRes.error}`,
        field: `${path}.from`,
      });
      return;
    }

    const tRes = resolveTargetHandle(targetNode, toParsed.port, sourceNode, sRes.handle);
    if (!tRes.ok) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `${path}: ${tRes.error}`,
        field: `${path}.to`,
      });
      return;
    }

    const compRes = checkPortCompatibility(sourceNode, targetNode, sRes.handle, tRes.handle);
    if (!compRes.ok) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `${path}: ${compRes.error}`,
        field: path,
      });
      return;
    }

    const sourceId = fromParsed.ref;
    const targetId = toParsed.ref;
    const sig = `${sourceId}.${sRes.handle}->${targetId}.${tRes.handle}`;

    if (edgeSignatures.has(sig)) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `Duplicate connection at ${path}: ${sig}.`,
        field: path,
      });
      return;
    }
    edgeSignatures.add(sig);

    const existsOnCanvas = existingEdges.some(
      (e) =>
        e.source === sourceId &&
        e.target === targetId &&
        e.sourceHandle === sRes.handle &&
        e.targetHandle === tRes.handle,
    );
    if (existsOnCanvas) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `Connection ${sig} already exists on canvas.`,
        field: path,
      });
      return;
    }

    resolvedEdges.push({
      source: sourceId,
      target: targetId,
      sourceHandle: sRes.handle,
      targetHandle: tRes.handle,
    });
  });

  if (errors.length === 0) {
    const combinedEdges = [
      ...existingEdges.map((e) => ({ source: e.source, target: e.target })),
      ...resolvedEdges.map((e) => ({ source: e.source, target: e.target })),
    ];
    const cycle = detectCycle(combinedEdges);
    if (cycle) {
      errors.push({
        code: TOOL_ERROR_CODE.PORT_MISMATCH,
        message: `Cycle detected in workflow graph: ${cycle.join(" -> ")}.`,
        field: "edges",
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    normalizedNodes,
    resolvedEdges,
  };
}

/**
 * Validates a workflow specification and throws a structured ToolError if any rule is violated.
 * Guaranteed zero mutation.
 *
 * @param {Object} input
 * @param {Array} existingNodes
 * @param {Array} existingEdges
 * @returns {{ ok: true, normalizedNodes: Array, resolvedEdges: Array }}
 */
export function validateWorkflowSpec(input, existingNodes = [], existingEdges = []) {
  const result = inspectWorkflowSpec(input, existingNodes, existingEdges);
  if (result.ok) {
    return result;
  }

  const { errors } = result;
  let code = TOOL_ERROR_CODE.ARGS_INVALID;
  if (errors.some((e) => e.code === TOOL_ERROR_CODE.NODE_NOT_FOUND)) {
    code = TOOL_ERROR_CODE.NODE_NOT_FOUND;
  } else if (errors.some((e) => e.code === TOOL_ERROR_CODE.PORT_MISMATCH)) {
    code = TOOL_ERROR_CODE.PORT_MISMATCH;
  }

  const missingNodes = errors
    .filter((e) => e.code === TOOL_ERROR_CODE.NODE_NOT_FOUND)
    .map((e) => e.message);

  throw createToolError(
    code,
    `Workflow graph validation failed with ${errors.length} issue(s): ${errors.map((e) => e.message).join("; ")}`,
    {
      missing: missingNodes.length > 0 ? { nodes: missingNodes } : null,
      details: {
        atomic: true,
        created: 0,
        connected: 0,
        problems: errors.map((e) => e.message),
        errors: errors.map((e) => ({
          code: e.code,
          message: e.message,
          field: e.field || null,
        })),
      },
      suggestion: {
        tool: null,
        args: {},
        note: "Fix all reported node types, refs, endpoints, ports, or cycles, then retry.",
      },
    },
  );
}
