import { HANDLE, NODE_TYPE, PLATFORM_TARGET } from "./nodes/types.js";
import { t } from "../shared/i18n.js";
import { getNodeVisualSize } from "./node-position.js";

const MAX_SHOTS = 9;

/** Build the legacy Prompt-based shot graph for already-saved workflows. */
export function createVideoStoryboardBatch(
  planNode,
  shots,
  browserRoutes = {},
) {
  if (!planNode || planNode.type !== NODE_TYPE.PROMPT) {
    throw new Error("A legacy Prompt storyboard plan node is required.");
  }
  if (!Array.isArray(shots) || shots.length < 1 || shots.length > MAX_SHOTS) {
    throw new Error("Provide between 1 and 9 storyboard shots.");
  }
  const rootId = planNode.data?.workflowRootId ?? planNode.id;
  const promptWidth = getNodeVisualSize(planNode).width;
  const promptHeight = getNodeVisualSize(planNode).height;
  const gap = 80;
  const items = [];
  const connections = [];
  const shotRefs = [];
  shots.forEach((shot, index) => {
    if (
      !shot ||
      ["title", "action", "framing", "imagePrompt", "videoPrompt"].some(
        (key) => typeof shot[key] !== "string" || !shot[key].trim(),
      )
    ) {
      throw new Error(
        `Shot ${index + 1} requires title, action, framing, imagePrompt and videoPrompt.`,
      );
    }
    if (
      shot.duration !== undefined &&
      (!Number.isFinite(shot.duration) || shot.duration <= 0)
    ) {
      throw new Error(`Shot ${index + 1} duration must be positive.`);
    }
    const number = index + 1;
    const prefix = `shot-${number}`;
    const y = planNode.position.y + index * (promptHeight * 2 + gap * 2);
    const promptX = planNode.position.x + promptWidth + gap;
    const mediaX = promptX + promptWidth + gap;
    const common = {
      workflowRootId: rootId,
      workflowParentId: planNode.id,
      shotNumber: number,
    };
    const stillRef = `${prefix}-still`;
    const imageRef = `${prefix}-image`;
    const motionRef = `${prefix}-motion`;
    const videoRef = `${prefix}-video`;
    items.push(
      {
        ref: stillRef,
        type: NODE_TYPE.PROMPT,
        position: { x: promptX, y },
        data: {
          ...common,
          title: t("nodeStore.videoScript.shotStill", { number }),
          text: [shot.title, shot.framing, shot.action, shot.imagePrompt].join(
            "\n",
          ),
          textInputMode: "current-only",
          workflowRole: "shotStill",
        },
      },
      {
        ref: imageRef,
        type: NODE_TYPE.GENERATE,
        position: { x: mediaX, y },
        data: {
          ...common,
          title: t("nodeStore.videoScript.shotImage", { number }),
          textInputMode: "direct",
          aspectRatio: "16:9",
          executionMode: "chat",
          platform: browserRoutes.image ?? PLATFORM_TARGET.AUTO,
          workflowRole: "shotImage",
        },
      },
      {
        ref: motionRef,
        type: NODE_TYPE.PROMPT,
        position: { x: promptX, y: y + promptHeight + gap },
        data: {
          ...common,
          title: t("nodeStore.videoScript.shotMotion", { number }),
          text: [shot.title, shot.action, shot.videoPrompt].join("\n"),
          textInputMode: "current-only",
          workflowRole: "shotMotion",
        },
      },
      {
        ref: videoRef,
        type: NODE_TYPE.VIDEO,
        position: {
          x:
            mediaX +
            getNodeVisualSize({ type: NODE_TYPE.GENERATE }).width +
            gap,
          y,
        },
        data: {
          ...common,
          title: t("nodeStore.videoScript.shotVideo", { number }),
          textInputMode: "direct",
          aspectRatio: "16:9",
          executionMode: "chat",
          platform: browserRoutes.video ?? PLATFORM_TARGET.AUTO,
          ...(shot.duration !== undefined ? { duration: shot.duration } : {}),
          workflowRole: "shotVideo",
        },
      },
    );
    connections.push(
      {
        source: planNode.id,
        sourceHandle: HANDLE.TEXT,
        target: stillRef,
        targetHandle: HANDLE.TEXT,
      },
      {
        source: planNode.id,
        sourceHandle: HANDLE.TEXT,
        target: motionRef,
        targetHandle: HANDLE.TEXT,
      },
      {
        source: stillRef,
        sourceHandle: HANDLE.TEXT,
        target: imageRef,
        targetHandle: HANDLE.TEXT,
      },
      {
        source: motionRef,
        sourceHandle: HANDLE.TEXT,
        target: videoRef,
        targetHandle: HANDLE.TEXT,
      },
      {
        source: imageRef,
        sourceHandle: HANDLE.IMAGE,
        target: videoRef,
        targetHandle: HANDLE.IMAGE,
      },
    );
    shotRefs.push({ number, stillRef, imageRef, motionRef, videoRef });
  });
  return { items, connections, shotRefs };
}
