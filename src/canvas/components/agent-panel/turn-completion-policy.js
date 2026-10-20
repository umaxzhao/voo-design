const PLAN_ONLY_PATTERNS = [
  /\b(?:plan|outline)\s+only\b/i,
  /\bdo\s+not\s+(?:execute|run|create|generate)\b/i,
  /\bwithout\s+(?:executing|running|creating|generating)\b/i,
  /^\s*(?:只|仅)(?:做|要)?(?:计划|规划|方案)/,
  /(?:不要|无需|不需要)(?:执行|运行|创建|生成)/,
];

const GENERATION_REQUEST_PATTERN =
  /\b(?:generate|render|create)\b|生成|产出|制作|渲染/i;
const GENERATION_TARGET_PATTERN =
  /\b(?:image|video|audio|asset|element|visual|chatgpt|gemini|jimeng)\b|图片|图像|视频|音频|素材|元素|视觉|生图|即梦/i;
const INDEPENDENT_ASSET_PATTERN =
  /\b(?:decompose|break\s+down|separate|independent|each|every|all)\b|拆解|拆分|单独|独立|逐一|每个|所有/i;
const ASSET_COLLECTION_PATTERN =
  /\b(?:images?|assets?|elements?|visuals?)\b|图片|图像|素材|元素|视觉/i;

export const MAX_EXECUTION_CONTINUATIONS = 2;

/** A layout receipt is a completed generation; it has no run_workflow step. */
export function isCompletedLayoutReceipt(toolName, result) {
  return (
    toolName === "generate_layout" &&
    result?.success === true &&
    result.result?.channel === "layout" &&
    typeof result.result.nodeId === "string"
  );
}

export function isPlanOnlyRequest(userText) {
  const text = String(userText || "");
  const startsWithEnglishPlan = /^\s*(?:plan|outline)\b/i.test(text);
  const startsWithChinesePlan = /^\s*(?:规划|计划)/.test(text);
  const remainder = text
    .replace(/^\s*(?:plan|outline)\b/i, "")
    .replace(/^\s*(?:规划|计划)/, "");
  const requestsExecutionAfterPlan =
    /\b(?:execute|run|create|generate|render)\b|执行|运行|创建|生成|制作|渲染/i.test(
      remainder,
    );
  if (
    (startsWithEnglishPlan || startsWithChinesePlan) &&
    !requestsExecutionAfterPlan
  ) {
    return true;
  }
  return PLAN_ONLY_PATTERNS.some((pattern) => pattern.test(text));
}

export function requiresWorkflowExecution(userText) {
  const text = String(userText || "");
  return (
    GENERATION_REQUEST_PATTERN.test(text) &&
    GENERATION_TARGET_PATTERN.test(text)
  );
}

export function requiresIndependentAssetBatch(userText) {
  const text = String(userText || "");
  return (
    requiresWorkflowExecution(text) &&
    INDEPENDENT_ASSET_PATTERN.test(text) &&
    ASSET_COLLECTION_PATTERN.test(text)
  );
}

export function isConnectedAssetBatch(args, { platform = null } = {}) {
  const nodes = Array.isArray(args?.nodes) ? args.nodes : [];
  const edges = Array.isArray(args?.edges) ? args.edges : [];
  if (
    nodes.length < 2 ||
    nodes.some(
      (node) =>
        node?.type !== "generate" ||
        typeof node.ref !== "string" ||
        node.ref.trim() === "" ||
        (platform &&
          (node.data?.platform !== platform ||
            node.data?.executionMode !== "chat")),
    )
  ) {
    return false;
  }

  const sourceIds = new Set();
  for (const node of nodes) {
    const edge = edges.find(
      (candidate) =>
        candidate?.targetId === node.ref &&
        candidate?.sourceHandle === "image" &&
        candidate?.targetHandle === "image" &&
        typeof candidate?.sourceId === "string" &&
        candidate.sourceId.trim() !== "",
    );
    if (!edge) return false;
    sourceIds.add(edge.sourceId);
  }
  return sourceIds.size === 1;
}

/**
 * A model-authored plan is not execution evidence. Actionable turns must not
 * finish until the canvas changed, and generation turns must additionally
 * reach the workflow runner. Explicit plan-only requests remain read-only.
 */
export function executionCompletionDecision({
  userText,
  sawPlan,
  successfulMutation,
  attemptedWorkflowRun,
  createdAssetBatch,
  continuationCount,
}) {
  if (isPlanOnlyRequest(userText)) return "complete";

  const generationRequired = requiresWorkflowExecution(userText);
  if (!sawPlan && !generationRequired) return "complete";

  const missingMutation = !successfulMutation;
  const missingWorkflowRun = generationRequired && !attemptedWorkflowRun;
  const missingAssetBatch =
    requiresIndependentAssetBatch(userText) && !createdAssetBatch;
  if (!missingMutation && !missingWorkflowRun && !missingAssetBatch) {
    return "complete";
  }

  return continuationCount < MAX_EXECUTION_CONTINUATIONS
    ? "continue"
    : "incomplete";
}

export function executionContinuationMessage(userText) {
  const generationRequired = requiresWorkflowExecution(userText);
  const lines = [
    "[VOO execution guard] The task is not complete: a plan or prose is not execution evidence.",
    "Continue now with tool calls. Do not reply with another summary before the requested work is attempted.",
  ];
  if (generationRequired) {
    lines.push(
      "For multiple independent visual assets, create one generate node per asset in a single create_node batch.",
      'When the user requested ChatGPT, set every node data object to platform "chatgpt" and executionMode "chat".',
      "Connect the selected source image to every generate node through image handles, then call run_workflow once with every returned nodeId; its explicit batch is serial.",
    );
  }
  return lines.join("\n");
}
