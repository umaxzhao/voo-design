/**
 * Storyboard execution: splitting a story into shots, rendering one keyframe
 * per shot, and rendering one video clip per shot on a storyboard-fed video
 * node.
 *
 * Both render loops reuse the ordinary single-node path instead of talking to
 * providers themselves. Each shot runs as a *virtual* node — the real node's
 * id and route with this shot's prompt, duration and keyframe — against a
 * graph derived from the live one. That keeps every provider, chat adapter,
 * durable-resume and asset-library rule in one place (executor_workflow_node
 * and api_executor); this file only decides what each shot asks for and
 * where its result lands.
 *
 * The inner run reports through a filtering onNodeStatus: its terminal
 * SUCCESS would otherwise mark the real node finished after the first shot
 * and replace its results, so results are captured here and the real node is
 * finished once, after the last shot.
 */
import { RPC } from "../../shared/messages.js";
import { API_MEDIA_TYPE } from "../../shared/providers.js";
import { callHost } from "../rpc.js";
import { streamProviderText, submitProviderJob } from "../provider_client.js";
import {
  EXECUTION_MODE,
  HANDLE,
  NODE_TYPE,
  RUN_STATUS,
} from "../nodes/types.js";
import { collectTextInputs } from "./graph_text_inputs.js";
import { RunError } from "./executor_errors.js";
import { resolveTarget } from "./executor_target.js";
import { buildSplitPrompt, parseSplitReply } from "./storyboard_compile.js";
import {
  keyframeSignature,
  needsStoryboardSheet,
  pendingKeyframes,
  storyboardSheetSignature,
} from "./storyboard_cache.js";
import {
  compileStoryboardKeyframePrompt,
  compileStoryboardSheetPrompt,
  usesStoryboardSheet,
} from "./storyboard_sheet.js";

/** Patch keys that belong to the inner run's own bookkeeping, not the node's. */
const INNER_RESULT_KEYS = [
  "status",
  "results",
  "selectedIndex",
  "galleryResults",
  "replyText",
];

function withoutInnerResult(patch) {
  const rest = { ...patch };
  for (const key of INNER_RESULT_KEYS) delete rest[key];
  return rest;
}

/** The storyboard wired into a video node's storyboard input, if any. */
export function findStoryboardSource(nodeId, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edge = edges.find(
    (candidate) =>
      candidate.target === nodeId &&
      candidate.targetHandle === HANDLE.STORYBOARD &&
      byId.get(candidate.source)?.type === NODE_TYPE.STORYBOARD,
  );
  return edge ? byId.get(edge.source) : null;
}

/**
 * Asks the storyboard's chat to split its upstream story into shots.
 * Returns the parsed shots; does not write them anywhere.
 */
export async function requestStoryboardSplit({
  nodeId,
  getGraph,
  settings,
  context = {},
}) {
  const { nodes, edges } = getGraph();
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new RunError("nodeMissing", nodeId);
  const story = collectTextInputs(nodeId, nodes, edges).join("\n\n").trim();
  if (!story) throw new RunError("storyboardNoStory", nodeId);

  const prompt = buildSplitPrompt({
    story,
    shotCount: node.data.shotCount,
    totalSeconds: node.data.totalDuration,
    style: node.data.style,
    aspectRatio: node.data.aspectRatio,
  });
  const result =
    node.data.splitExecutionMode === EXECUTION_MODE.API
      ? await requestApiSplit(node, prompt)
      : await requestChatSplit(node, prompt, settings, context);
  try {
    return parseSplitReply(result?.text, {
      totalSeconds: node.data.totalDuration,
    });
  } catch (error) {
    throw new RunError(error.code ?? "storyboardParse", nodeId);
  }
}

/** Text API route for splitting; the image route on this board stays intact. */
async function requestApiSplit(node, prompt) {
  const providerId = node.data.splitProviderId;
  const model = node.data.splitModelId;
  if (!providerId || !model) {
    throw new RunError("storyboardSplitModelMissing", node.id);
  }
  const job = {
    providerId,
    mediaType: API_MEDIA_TYPE.TEXT,
    request: { model, prompt },
  };
  try {
    return await streamProviderText(job);
  } catch (error) {
    // Old hosts may not support streaming. Retry only that protocol mismatch;
    // a provider failure must not silently submit a second paid request.
    if (error?.code !== "unknownMessage") throw error;
    return submitProviderJob(job);
  }
}

async function requestChatSplit(node, prompt, settings, context) {
  const platform = resolveTarget(
    { id: node.id, data: { platform: node.data.splitPlatform } },
    context,
  );
  const timeoutMs = settings?.timeoutMs ?? 300000;
  return callHost(
    RPC.GENERATE_TEXT,
    {
      nodeId: node.id,
      prompt,
      timeoutMs,
      settleMs: settings?.settleMs ?? 1500,
      newConversation: true,
      responseFormat: "json",
    },
    { timeout: timeoutMs + 30000, platform },
  );
}

/**
 * Clears the durable per-node job handles between shots. The provider paths
 * resume whatever job is recorded under the node id, so a finished shot's
 * handle left in place would be "resumed" as the next shot.
 */
export async function releaseShotJob(nodeId, context) {
  await context.execution?.recordNodePatch?.(nodeId, {
    remoteJob: null,
    webGeneration: null,
  });
}

/**
 * Runs a shot loop and, if it fails midway, drops its "shot n/m" marker so
 * the node does not keep claiming progress on the next, unrelated run.
 */
export async function clearingProgress(options, loop) {
  try {
    return await loop(options);
  } catch (error) {
    options.onNodeStatus(options.nodeId, { storyboardProgress: null });
    throw error;
  }
}

/** The live graph with `nodeId` replaced by a virtual node. */
export function graphWith(getGraph, nodeId, buildNode, extra = {}) {
  const { nodes, edges } = getGraph();
  const real = nodes.find((candidate) => candidate.id === nodeId);
  if (!real) throw new RunError("nodeMissing", nodeId);
  return {
    real,
    graph: {
      nodes: [
        ...nodes.map((node) => (node.id === nodeId ? buildNode(real) : node)),
        ...(extra.nodes ?? []),
      ],
      edges: [
        ...(extra.filterEdges ? edges.filter(extra.filterEdges) : edges),
      ].concat(extra.edges ?? []),
    },
  };
}

/**
 * Runs one shot through the ordinary single-node path and returns the ids it
 * produced. Everything but the terminal result is forwarded to the real node.
 */
export async function runShot({
  nodeId,
  graph,
  runNode,
  settings,
  context,
  onNodeStatus,
}) {
  let produced = [];
  let entries = [];
  await runNode({
    nodeId,
    getGraph: () => graph,
    settings,
    context,
    onNodeStatus: (id, patch) => {
      if (id !== nodeId) {
        onNodeStatus(id, patch);
        return;
      }
      if (patch.status === RUN_STATUS.SUCCESS) {
        produced = Array.isArray(patch.results) ? patch.results : [];
        entries = patch.imageEntries ?? [];
      }
      const forwarded = withoutInnerResult(patch);
      delete forwarded.imageEntries;
      if (Object.keys(forwarded).length > 0) onNodeStatus(id, forwarded);
    },
  });
  await releaseShotJob(nodeId, context);
  return { produced, entries };
}

/**
 * A storyboard node's run: split first when it has no shots, then render the
 * keyframe of every shot whose recipe has changed or has no output.
 */
export function runStoryboardNode(options) {
  return clearingProgress(options, renderKeyframes);
}

async function renderSheet({
  nodeId,
  getGraph,
  settings,
  context,
  onNodeStatus,
  runNode,
}) {
  const { nodes, edges } = getGraph();
  const board = nodes.find((node) => node.id === nodeId);
  if (!needsStoryboardSheet(board, nodes, edges)) return 0;
  if (context.shouldStop?.()) throw new RunError("stopped", nodeId);
  onNodeStatus(nodeId, { stage: "storyboardSheet" });
  await releaseShotJob(nodeId, context);
  const { graph } = graphWith(getGraph, nodeId, (real) => ({
    ...real,
    type: NODE_TYPE.GENERATE,
    data: {
      ...real.data,
      prompt: compileStoryboardSheetPrompt(board),
      count: 1,
      results: [],
      remoteJob: null,
      webGeneration: null,
      textInputMode: "current-only",
      mentions: undefined,
    },
  }));
  const { produced, entries } = await runShot({
    nodeId,
    graph,
    runNode,
    settings,
    context,
    onNodeStatus,
  });
  if (produced.length === 0) throw new RunError("noImage", nodeId);
  onNodeStatus(nodeId, {
    sheetImageId: produced[0],
    sheetSignature: storyboardSheetSignature(board, nodes, edges),
    imageEntries: entries,
  });
  const currentGraph = getGraph();
  const currentBoard = currentGraph.nodes.find((node) => node.id === nodeId);
  if (
    needsStoryboardSheet(currentBoard, currentGraph.nodes, currentGraph.edges)
  ) {
    throw new RunError("storyboardSheetStale", nodeId);
  }
  return 1;
}

async function renderKeyframes({
  nodeId,
  getGraph,
  settings,
  context,
  onNodeStatus,
  runNode,
}) {
  const initial = getGraph().nodes.find((node) => node.id === nodeId);
  if (!initial) throw new RunError("nodeMissing", nodeId);
  if ((initial.data.shots ?? []).length === 0) {
    onNodeStatus(nodeId, { stage: "storyboardSplitting" });
    const shots = await requestStoryboardSplit({
      nodeId,
      getGraph,
      settings,
      context,
    });
    onNodeStatus(nodeId, { shots });
  }

  const sheetCount = await renderSheet({
    nodeId,
    getGraph,
    settings,
    context,
    onNodeStatus,
    runNode,
  });
  const current = () =>
    getGraph().nodes.find((node) => node.id === nodeId)?.data ?? {};
  const initialGraph = getGraph();
  const board = initialGraph.nodes.find((node) => node.id === nodeId);
  const pending = pendingKeyframes(
    board,
    initialGraph.nodes,
    initialGraph.edges,
  );
  let rendered = 0;
  for (const [index, shot] of pending.entries()) {
    if (context.shouldStop?.()) throw new RunError("stopped", nodeId);
    onNodeStatus(nodeId, {
      stage: "storyboardKeyframe",
      storyboardProgress: { current: index + 1, total: pending.length },
    });
    await releaseShotJob(nodeId, context);
    const sheetNodeId = `${nodeId}::sheet`;
    const sheetReference = usesStoryboardSheet(board)
      ? {
          nodes: [
            {
              id: sheetNodeId,
              type: NODE_TYPE.PREVIEW,
              position: { x: -1e9, y: -1e9 },
              data: {
                mediaType: "image",
                imageId: board.data.sheetImageId,
                origin: "generated",
              },
            },
          ],
          edges: [
            {
              id: `${sheetNodeId}->${nodeId}`,
              source: sheetNodeId,
              sourceHandle: HANDLE.MEDIA,
              target: nodeId,
              targetHandle: HANDLE.IMAGE,
            },
          ],
        }
      : {};
    const { graph } = graphWith(
      getGraph,
      nodeId,
      (real) => ({
        ...real,
        type: NODE_TYPE.GENERATE,
        data: {
          ...real.data,
          prompt: compileStoryboardKeyframePrompt(shot, board),
          count: 1,
          results: [],
          remoteJob: null,
          webGeneration: null,
          // The story wire is for splitting; a keyframe gets only its own shot.
          textInputMode: "current-only",
          mentions: undefined,
        },
      }),
      sheetReference,
    );
    const { produced, entries } = await runShot({
      nodeId,
      graph,
      runNode,
      settings,
      context,
      onNodeStatus,
    });
    if (produced.length === 0) throw new RunError("noImage", nodeId);
    // Preserve the recipe that produced this output. If a shot changed while
    // generating, its signature remains stale and the next run remakes it.
    const signature = keyframeSignature(
      shot,
      board,
      initialGraph.nodes,
      initialGraph.edges,
    );
    const shots = (current().shots ?? []).map((item) =>
      item.id === shot.id
        ? { ...item, keyframeId: produced[0], keyframeSignature: signature }
        : item,
    );
    onNodeStatus(nodeId, { shots, imageEntries: entries });
    rendered += 1;
  }
  onNodeStatus(nodeId, {
    status: RUN_STATUS.SUCCESS,
    stage: null,
    error: null,
    storyboardProgress: null,
  });
  return rendered + sheetCount;
}

export { runStoryboardVideo } from "./storyboard_video_run.js";
