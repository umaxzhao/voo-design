import {
  EXECUTION_MODE,
  HANDLE,
  NODE_TYPE,
  PLATFORM_TARGET,
  createNode,
} from "../nodes/types.js";
import { getNodeTypeDefinition } from "../nodes/registry.js";
import {
  DEFAULT_API_IMAGE_MODEL_ID,
  PROVIDER_ID,
} from "../../shared/providers.js";

/** Clear space between two starter nodes, matching the canvas layout gap. */
const STARTER_COLUMN_GAP = 130;

/**
 * Where the next starter column begins.
 *
 * Derived from the previous node's declared width rather than hardcoded: the
 * columns used to sit at fixed offsets, so widening the prompt node's default
 * size left it overlapping the node downstream of it.
 */
function nextColumnX(x, type) {
  return x + getNodeTypeDefinition(type).size.width + STARTER_COLUMN_GAP;
}

/** Creates the default Text2Img (文生图) starter pipeline: Prompt -> Generate -> Group. */
export function createStarterWorkflow(platformId) {
  // A canvas with no chat host (standalone web without the extension) cannot
  // drive a chat-site target, so the starter pipeline is born on the VOO
  // Cloud gateway instead: an API node runs without a host, and the run
  // button stays usable instead of blocked-with-no-explanation. The chat
  // target field keeps its default — an API node never reads it.
  const hosted = Object.values(PLATFORM_TARGET).includes(platformId);
  const overrides = hosted
    ? { platform: platformId }
    : {
        executionMode: EXECUTION_MODE.API,
        providerId: PROVIDER_ID.AI_302,
        modelId: DEFAULT_API_IMAGE_MODEL_ID,
      };

  const promptX = 0;
  const generateX = nextColumnX(0, NODE_TYPE.PROMPT);
  const groupX = nextColumnX(generateX, NODE_TYPE.GENERATE);

  // 1. Prompt Node (Text input)
  const promptNode = createNode(NODE_TYPE.PROMPT, { x: promptX, y: 0 });
  // 2. Generate Node (Mid)
  const generateNode = {
    ...createNode(NODE_TYPE.GENERATE, { x: generateX, y: 0 }, overrides),
    selected: true,
  };
  // 3. Group Node (Right)
  const groupNode = {
    ...createNode(NODE_TYPE.GROUP, { x: groupX, y: 0 }),
    style: { ...getNodeTypeDefinition(NODE_TYPE.GROUP).size },
  };

  const edges = [
    // Prompt -> Generate Text Port
    {
      id: `edge-${promptNode.id}-${generateNode.id}`,
      source: promptNode.id,
      sourceHandle: HANDLE.TEXT,
      target: generateNode.id,
      targetHandle: HANDLE.TEXT,
      type: "default",
      animated: false,
    },
    // Generate -> Group Media Port
    {
      id: `edge-${generateNode.id}-${groupNode.id}`,
      source: generateNode.id,
      sourceHandle: HANDLE.IMAGE,
      target: groupNode.id,
      targetHandle: HANDLE.MEDIA,
      type: "default",
      animated: false,
    },
  ];

  return {
    nodes: [promptNode, generateNode, groupNode],
    edges,
    starterNode: generateNode,
  };
}

/** Creates the one-time chat image starter bound to the opening platform. */
export function createStarterNode(platformId) {
  return createStarterWorkflow(platformId).starterNode;
}
