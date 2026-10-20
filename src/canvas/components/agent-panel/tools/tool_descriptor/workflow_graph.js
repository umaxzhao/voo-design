/**
 * Canvas graph / workflow tool descriptor definitions.
 */
import {
  CONNECTION_ITEM_SCHEMA,
  CONNECTION_PARAMETER_PROPERTIES,
  CREATE_NODE_ITEM_SCHEMA,
  CREATE_NODE_PARAMETER_PROPERTIES,
  CREATE_NODE_TYPES,
} from "./constants.js";
import { GAME_ASSET_WORKFLOW_TOOL_DEFINITION } from "./game_asset_workflow.js";

export const WORKFLOW_GRAPH_TOOL_DEFINITIONS = {
  ...GAME_ASSET_WORKFLOW_TOOL_DEFINITION,

  create_node: {
    name: "create_node",
    description:
      "Create one node, or atomically create and initialize a nodes list with exactly one undo step. Batch items accept initial data and request-local refs. An optional edges list can connect new refs or existing node IDs in the same transaction, so creating, filling, and linking a small workflow is one undoable action. Every node and edge is validated before mutation; any failure creates nothing. Nodes without explicit positions are automatically laid out using registered node dimensions.",
    params: {
      type: "object",
      properties: {
        ...CREATE_NODE_PARAMETER_PROPERTIES,
        nodes: {
          type: "array",
          items: CREATE_NODE_ITEM_SCHEMA,
          minItems: 1,
          description:
            "Nodes to create atomically. Refs must be unique. Do not combine with the single-node fields.",
        },
        edges: {
          type: "array",
          items: CONNECTION_ITEM_SCHEMA,
          minItems: 1,
          description:
            "Optional edges committed with nodes in the same atomic transaction and undo step. sourceId and targetId may be a new node ref or an existing node ID. Only use with nodes.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
  },

  connect_nodes: {
    name: "connect_nodes",
    description:
      "Connect one edge or atomically connect an edges list with exactly one undo step. Every batch edge is validated before mutation; any invalid endpoint, port, duplicate, or cycle leaves the graph unchanged. Connecting changes edges only: it does not execute or recalculate nodes and does not change node status, results, or data. Target nodes read the new inputs on the next explicit workflow run.",
    params: {
      type: "object",
      properties: {
        ...CONNECTION_PARAMETER_PROPERTIES,
        edges: {
          type: "array",
          items: CONNECTION_ITEM_SCHEMA,
          minItems: 1,
          description:
            "Edges to add in one atomic transaction and one undo step. Do not combine with the single-edge fields.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
    requires: {
      canvas: ["node:sourceId", "node:targetId"],
    },
  },

  bind_agent_group: {
    name: "bind_agent_group",
    description:
      'Bind an Agent Gen (type "agent") node\'s artifact output to the Group that owns its generated artifacts. Use for an existing Agent node or an explicitly requested reusable autonomous Agent workflow. Direct Design creation uses generate_layout without an Agent or bound Group; multi-page designs use create_multi_canvas. The user talks to the bound Agent node in the side panel and its artifacts land in that Group. The binding is stored on the agent node, not as a graph edge, so it never affects run order or cost. Do not use connect_nodes for an agent-to-group link.',
    params: {
      type: "object",
      properties: {
        agentNodeId: {
          type: "string",
          description: 'The Agent Gen node (type "agent") to bind.',
        },
        groupId: {
          type: "string",
          description:
            'The Group node (type "groupNode") that will own the artifacts.',
        },
      },
      required: ["agentNodeId", "groupId"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: true,
      reversible: true,
      timeout: null,
    },
    requires: {
      canvas: ["node:agentNodeId", "node:groupId"],
    },
  },

  delete_node: {
    name: "delete_node",
    description:
      "Remove one or multiple nodes and their connected edges from the canvas. Use nodeId for one node or nodeIds for an atomic batch with one undo step.",
    params: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Single node ID to delete." },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          uniqueItems: true,
          description:
            "Node IDs to delete together in one atomic transaction. Do not combine with nodeId.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "destructive",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
    requires: {
      canvas: ["node:nodeId"],
      approval: "destructive",
    },
  },

  align_layout: {
    name: "align_layout",
    description:
      "Automatically reflow nodes into a clean, evenly-spaced dependency layout. When nodeIds are provided, only those nodes are tidied without moving other nodes.",
    params: {
      type: "object",
      properties: {
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional subset of node IDs to align. When omitted, reflows the whole canvas.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    requires: {
      store: ["alignWorkflow"],
    },
  },

  analyze_canvas: {
    name: "analyze_canvas",
    description:
      "Analyze the current workflow structure: node count by type, connection graph, potential issues (disconnected nodes, missing inputs), and overall topology.",
    params: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    approvalLevel: "read-only",
  },

  edit_node: {
    name: "edit_node",
    description:
      "Update one or multiple nodes. Use nodeId for one node, nodeIds plus data/position for the same atomic update, or updates for distinct per-node updates with one undo step.",
    params: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The node to update." },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          uniqueItems: true,
          description:
            "Node IDs that receive the same data or position update atomically. Do not combine with nodeId or updates.",
        },
        updates: {
          type: "array",
          minItems: 1,
          description:
            "Distinct per-node updates applied in one atomic transaction. Use when each node receives different data or position values.",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "Node ID to update." },
              data: {
                type: "object",
                additionalProperties: true,
                description:
                  "Data fields to merge into this node. Common fields: prompt nodes use { text: 'string' }; generate/videoShot nodes use { prompt: 'string', platform?: '...', aspectRatio?: '...' }; groupNode uses { label: 'string' }.",
              },
              position: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
                additionalProperties: false,
                description: "New canvas position for this node.",
              },
            },
            required: ["nodeId"],
            additionalProperties: false,
          },
        },
        data: {
          type: "object",
          description:
            "Key-value pairs to merge into the node's data. Common fields: prompt nodes use { text: 'string' }; generate/videoShot nodes use { prompt: 'string', platform: '...', aspectRatio: '...' }; groupNode uses { label: 'string' }.",
          additionalProperties: true,
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "New canvas position. Omit to keep current.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
    requires: {
      canvas: ["node:nodeId"],
    },
  },

  instantiate_subgraph: {
    name: "instantiate_subgraph",
    description:
      "Instantiate a subgraph template saved with save_as_subgraph: re-create its nodes and edges at a position, optionally rewiring the template's declared input/output ports to existing canvas nodes. Pass inputRewire/outputRewire as arrays of {port, handle, nodeId, handle?} — port is the template's node index, handle the port handle (from save_as_subgraph's result).",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name." },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          description:
            "Top-left anchor for the template's bounding box (default 0,0).",
        },
        inputRewire: {
          type: "array",
          description:
            "Rewire template input ports to existing canvas nodes: array of { port, handle, nodeId, outHandle? }.",
          items: {
            type: "object",
            properties: {
              port: { type: "number" },
              handle: { type: "string" },
              nodeId: { type: "string" },
              outHandle: { type: "string" },
            },
            required: ["port", "nodeId"],
          },
        },
        outputRewire: {
          type: "array",
          description:
            "Rewire template output ports to existing canvas nodes: array of { port, handle, nodeId, inHandle? }.",
          items: {
            type: "object",
            properties: {
              port: { type: "number" },
              handle: { type: "string" },
              nodeId: { type: "string" },
              inHandle: { type: "string" },
            },
            required: ["port", "nodeId"],
          },
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    requires: { args: ["name"] },
  },

  list_nodes: {
    name: "list_nodes",
    description:
      "List canvas node summaries with execution status, errors and recovery instructions. To read user-authored node text, pass nodeId with includeContent=true. Content is bounded; use field, offset and limit to read later portions of long text. Only supported text fields are returned, never raw node data or media assets.",
    params: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            'Optional node type filter (e.g. "generate", "apiImage"). Omit for all nodes.',
        },
        nodeId: {
          type: "string",
          description: "Optional exact node ID. Required with includeContent.",
        },
        includeContent: {
          type: "boolean",
          description:
            "Read bounded text content from the specified node. Defaults to false.",
        },
        field: {
          type: "string",
          enum: [
            "text",
            "aiPrompt",
            "brief",
            "markdown",
            "html",
            "outline",
            "pages",
          ],
          description:
            "Optional text field to read or continue. Prompt nodes expose text and aiPrompt; Agent Gen exposes brief; Preview exposes markdown, html, outline and textual pages.",
        },
        pageIndex: {
          type: "integer",
          minimum: 0,
          description:
            "Zero-based page index when reading a Preview pages field.",
        },
        pageField: {
          type: "string",
          enum: ["title", "text", "markdown", "html", "notes"],
          description:
            "Text field within a page. Select it with pageIndex to continue long page text.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description:
            "Character offset for one selected field or page. Use with field.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 12000,
          description:
            "Maximum characters in one content response. Defaults to 8000.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "read-only",
  },

  pick_version: {
    name: "pick_version",
    description:
      "List or select the generated versions of a node. Call with only nodeId to list what is available (versions/results with their index and id), then call again with nodeId plus versionId (layout/text nodes), index (any node), or assetId (media nodes) to make that version the node's active result. For layout nodes the selection is re-parsed into editable layers; for media nodes the active result changes and editor nodes fed from it follow. Never retry blindly on INDEX_OUT_OF_RANGE / VERSION_NOT_FOUND — list first.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "The node whose generated versions to list or select.",
        },
        versionId: {
          type: "string",
          description: "Pick by version id (layout/text nodes). Omit to list.",
        },
        index: {
          type: "integer",
          description:
            "Pick by zero-based index into the version list. Omit to list.",
        },
        assetId: {
          type: "string",
          description: "Pick a media result by its asset id (media nodes).",
        },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    requires: {
      canvas: ["node:nodeId"],
    },
  },

  run_workflow: {
    name: "run_workflow",
    description:
      "Execute the current workflow. Use nodeIds to target explicit nodes with best-effort, non-atomic execution in dependency order and a per-node receipt. A failed node does not roll back earlier external calls, costs, or results; other targets are still attempted unless a web submission or media collection is uncertain, which stops later targets. For a node with web recovery state, running that same node only recovers the original operation and never resubmits; keep its prompt and references unchanged until recovery finishes. Call list_nodes to inspect status, results, errors and recovery instructions. Run status/progress updates and failure-only batches create no workflow undo entry; all successful outputs from one explicit nodeIds batch share exactly one undo entry.",
    params: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["full", "selected", "stale"],
          description:
            '"full" runs the entire workflow; "selected" runs selected nodes; "stale" runs new, failed, and input-changed nodes only.',
        },
        nodeIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          uniqueItems: true,
          description:
            "Explicit node IDs to run with best-effort, non-atomic semantics and per-node results. Do not combine with mode.",
        },
      },
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: true,
      estimatedCost: 0,
      idempotent: false,
      reversible: false,
      timeout: null,
    },
    requires: {
      canvas: ["nodes:≥1"],
    },
  },

  save_as_subgraph: {
    name: "save_as_subgraph",
    description:
      "Save the currently selected canvas nodes as a reusable subgraph template. Boundary connections become declared input/output ports; the template is stored locally under a name and can be re-instantiated with instantiate_subgraph.",
    params: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Template name (kebab-case or plain words).",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    requires: { args: ["name"] },
  },

  build_workflow: {
    name: "build_workflow",
    description:
      "Atomically create, connect, and optionally run an entire workflow graph in one agent call with a single undo entry and single ChangeSet. Supports request-local refs for new nodes and references to existing canvas node IDs. Validates the entire graph topology before mutating; any error creates nothing. Automatically places unpositioned nodes in a layered left-to-right layout that does not overlap existing canvas nodes. Use for a requested multi-node pipeline, supporting asset branches, or edits to an existing graph. A direct single-page design uses generate_layout; multi-page designs use create_multi_canvas then generate_layout per page. Create an Agent Gen node plus a bound Group only for an explicitly requested reusable autonomous Agent workflow.",
    params: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref: {
                type: "string",
                description:
                  "Unique request-local reference name for this node, used by edges.",
              },
              type: {
                type: "string",
                enum: CREATE_NODE_TYPES,
                description: "Node type.",
              },
              data: {
                type: "object",
                description:
                  "Optional initial node data, such as { text } for a prompt node.",
              },
              position: {
                type: "object",
                properties: {
                  x: { type: "number", description: "X coordinate on canvas." },
                  y: { type: "number", description: "Y coordinate on canvas." },
                },
                description:
                  "Optional canvas position. When omitted, automatically placed without overlap.",
              },
            },
            required: ["ref", "type"],
            additionalProperties: false,
          },
          minItems: 1,
          description: "List of nodes to create in the workflow.",
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: {
                type: "string",
                description:
                  "Source endpoint in 'ref[.port]' format. Ref can be a local ref or an existing node ID.",
              },
              to: {
                type: "string",
                description:
                  "Target endpoint in 'ref[.port]' format. Ref can be a local ref or an existing node ID.",
              },
            },
            required: ["from", "to"],
            additionalProperties: false,
          },
          description:
            "Connections between nodes. Endpoints specify 'ref' or 'ref.port'.",
        },
        run: {
          type: "boolean",
          description:
            "Whether to execute the created nodes immediately after creation.",
        },
        attachTo: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description:
                "Existing canvas node ID to attach this workflow to.",
            },
            port: {
              type: "string",
              description: "Optional port on the existing node to attach to.",
            },
          },
          required: ["nodeId"],
          additionalProperties: false,
          description:
            "Optional existing canvas node to connect into this workflow.",
        },
      },
      required: ["nodes"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: {
      mutates: true,
      externalData: false,
      estimatedCost: 0,
      idempotent: false,
      reversible: true,
      timeout: null,
    },
  },
};
