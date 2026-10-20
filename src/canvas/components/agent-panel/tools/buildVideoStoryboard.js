import { NODE_TYPE } from "../../../nodes/types.js";
import { createVideoStoryboardBatch } from "../../../video_storyboard_workflow.js";
import { appendVideoShotFeedback } from "../../../video_storyboard_feedback.js";
import { t } from "../../../../shared/i18n.js";
import runWorkflowTool from "./runWorkflow.js";
import editNodeTool from "./editNode.js";
import {
  getVideoDurationProfile,
  validateVideoDuration,
} from "../../../../shared/providers/video_duration.js";
import {
  firstAvailablePlatform,
  platformHasOpenTab,
  WEB_IMAGE_PLATFORMS,
  WEB_VIDEO_PLATFORMS,
} from "../../../generation_target_defaults.js";
import {
  getConnectedPlatforms,
  refreshConnectedPlatforms,
} from "../../../generation-target-state.js";
import { getSetting } from "../../../../shared/settings.js";
import { SHOT_SCHEMA } from "./videoStoryboardSchema.js";
const SHOT_ROLES = ["shotStill", "shotImage", "shotMotion", "shotVideo"];
async function currentBrowserRoutes(context) {
  if (!context.getConnectedPlatforms) await refreshConnectedPlatforms();
  const connectivity = {
    connectedPlatforms:
      context.getConnectedPlatforms?.() ?? getConnectedPlatforms(),
    disabledSites: getSetting("ciw.disabledSitePlatforms") ?? [],
  };
  return {
    image: firstAvailablePlatform(WEB_IMAGE_PLATFORMS, connectivity),
    video: firstAvailablePlatform(WEB_VIDEO_PLATFORMS, connectivity),
    ...connectivity,
  };
}
function existingShotNodes(store, planNodeId, shotCount) {
  const nodes = store.nodes.filter(
    (node) =>
      node.data?.workflowParentId === planNodeId &&
      SHOT_ROLES.includes(node.data.workflowRole),
  );
  if (nodes.length === 0) return null;
  const byShot = Array.from({ length: shotCount }, (_, index) => {
    const number = index + 1;
    return Object.fromEntries(
      SHOT_ROLES.map((role) => [
        role,
        nodes.find(
          (node) =>
            node.data.shotNumber === number && node.data.workflowRole === role,
        )?.id,
      ]),
    );
  });
  if (
    nodes.length !== shotCount * SHOT_ROLES.length ||
    byShot.some((shot) => SHOT_ROLES.some((role) => !shot[role]))
  ) {
    throw new Error(
      "Storyboard nodes changed. Restore the missing nodes or create a new storyboard.",
    );
  }
  return byShot;
}
async function createStoryboardGraph({
  store,
  planNode,
  scriptNode,
  args,
  context,
  routes,
}) {
  const batch = createVideoStoryboardBatch(planNode, args.shots, routes);
  const created = store.batchCreateNodes(batch.items, batch.connections);
  if (!created)
    throw new Error("Storyboard could not be added to this canvas.");
  const planText = args.shots
    .map((shot, index) =>
      [
        `${index + 1}. ${shot.title}`,
        shot.framing,
        shot.action,
        shot.imagePrompt,
        shot.videoPrompt,
      ].join("\n"),
    )
    .join("\n\n");
  const durationUpdates = batch.shotRefs.flatMap((shot) => {
    const videoNode = created.nodes.find(
      (node, index) => batch.items[index].ref === shot.videoRef,
    );
    const validation = validateVideoDuration(
      videoNode.data.duration,
      videoNode.data,
    );
    if (validation.valid) return [];
    const profile = getVideoDurationProfile(videoNode.data);
    return [
      {
        nodeId: videoNode.id,
        data: { duration: profile.options[0] ?? profile.min ?? null },
      },
    ];
  });
  await editNodeTool.execute(
    {
      updates: [
        { nodeId: scriptNode.id, data: { text: args.script.trim() } },
        { nodeId: planNode.id, data: { text: planText } },
        ...durationUpdates,
      ],
    },
    context,
  );
  const byRef = new Map(
    batch.items.map((item, index) => [item.ref, created.nodes[index].id]),
  );
  return batch.shotRefs.map((shot) => ({
    shotStill: byRef.get(shot.stillRef),
    shotImage: byRef.get(shot.imageRef),
    shotMotion: byRef.get(shot.motionRef),
    shotVideo: byRef.get(shot.videoRef),
  }));
}

export default {
  spec: {
    name: "build_video_storyboard",
    description:
      "Legacy compatibility for an existing video-script canvas whose storyboard plan is a Prompt node. Create editable still and motion prompts for each shot, then generate each shot in sequence through open image and video website sessions. New workflows should use the standalone storyboardPlan node connected to a videoShot node. Guided mode pauses before each legacy shot. Website subscription or quota cost is unknown and is not a VOO price estimate.",
    parameters: {
      type: "object",
      properties: {
        planNodeId: {
          type: "string",
          description:
            "Existing legacy Prompt storyboard plan node connected to the story/script. New storyboardPlan nodes do not use this tool.",
        },
        script: {
          type: "string",
          description:
            "Completed script drafted from the connected story, including character and style continuity.",
        },
        shots: { type: "array", items: SHOT_SCHEMA, minItems: 1, maxItems: 9 },
        mode: { type: "string", enum: ["guided", "auto"] },
      },
      required: ["planNodeId", "script", "shots", "mode"],
      additionalProperties: false,
    },
  },
  approvalLevel: "canvas-mutation",
  capabilities: {
    mutates: true,
    externalData: true,
    estimatedCost: null,
    externalWebsiteCost: "unknown",
    idempotent: false,
    reversible: true,
    timeout: null,
  },
  async execute(args, context) {
    const store = context.getStore();
    const planNode = store.nodes?.find((node) => node.id === args.planNodeId);
    if (!planNode || planNode.type !== NODE_TYPE.PROMPT) {
      throw new Error("A valid Prompt storyboard plan node is required.");
    }
    const scriptNode = store.nodes?.find(
      (node) =>
        node.id === planNode.data?.workflowParentId &&
        node.type === NODE_TYPE.PROMPT,
    );
    if (!scriptNode || planNode.data?.workflowRole !== "storyboardPlan") {
      throw new Error(
        "Use a connected video script preset storyboard plan node.",
      );
    }
    if (typeof args.script !== "string" || !args.script.trim()) {
      throw new Error("A drafted video script is required.");
    }
    if (typeof store.batchCreateNodes !== "function") {
      throw new Error("Workflow batch creation is unavailable.");
    }
    if (typeof store.batchUpdateNodes !== "function") {
      throw new Error("Workflow node editing is unavailable.");
    }
    if (args.mode === "guided" && !context.requestUserResponse) {
      throw new Error("Guided mode requires the Agent panel response handler.");
    }
    if (!["guided", "auto"].includes(args.mode)) {
      throw new Error("Mode must be guided or auto.");
    }
    let routes = await currentBrowserRoutes(context);
    let shotNodes = existingShotNodes(store, planNode.id, args.shots.length);
    if (!shotNodes) {
      shotNodes = await createStoryboardGraph({
        store,
        planNode,
        scriptNode,
        args,
        context,
        routes,
      });
    }
    const results = [];
    let index = 0;
    while (index < shotNodes.length) {
      const number = index + 1;
      if (context.signal?.aborted)
        return {
          status: "stopped",
          shots: results,
          nextShot: number,
          externalWebsiteCost: "unknown",
        };
      if (args.mode === "guided") {
        let question = t("nodeStore.videoScript.continueShot", { number });
        let choiceReady = false;
        while (!choiceReady) {
          const response = await context.requestUserResponse(question, [
            t("nodeStore.videoScript.continue"),
            ...(index > 0 ? [t("nodeStore.videoScript.back")] : []),
            t("nodeStore.videoScript.stop"),
          ]);
          if (
            response === null ||
            response === t("nodeStore.videoScript.stop")
          ) {
            return {
              status: "stopped",
              shots: results,
              nextShot: number,
              externalWebsiteCost: "unknown",
            };
          }
          if (response === t("nodeStore.videoScript.back")) {
            index -= 1;
            break;
          }
          if (response !== t("nodeStore.videoScript.continue")) {
            const feedback = String(response).trim();
            if (!feedback) continue;
            await appendVideoShotFeedback(
              context.getStore(),
              shotNodes[index],
              feedback,
            );
            question = t("nodeStore.videoScript.feedback", {
              feedback,
            });
            continue;
          }
          routes = await currentBrowserRoutes(context);
          if (!routes.image || !routes.video) {
            question = t("nodeStore.videoScript.browserRouteRequired", {
              number,
            });
            continue;
          }
          choiceReady = true;
        }
        if (index < number - 1) continue;
      } else {
        routes = await currentBrowserRoutes(context);
        if (!routes.image || !routes.video) {
          return {
            status: "browser_route_required",
            shots: results,
            nextShot: number,
            retryable: true,
            externalWebsiteCost: "unknown",
          };
        }
      }
      let ids = shotNodes[index];
      const liveNodes = context.getStore().nodes;
      if (
        !liveNodes.some((node) => node.id === ids.shotImage) ||
        !liveNodes.some((node) => node.id === ids.shotVideo)
      ) {
        // Undo may remove the entire generated graph while the Agent is waiting.
        // Recreate it before resuming instead of running stale node IDs.
        const livePlan = liveNodes.find((node) => node.id === planNode.id);
        const liveScript = liveNodes.find((node) => node.id === scriptNode.id);
        if (!livePlan || !liveScript) {
          return {
            status: "storyboard_changed",
            shots: results,
            nextShot: number,
            retryable: true,
            externalWebsiteCost: "unknown",
          };
        }
        const existing = existingShotNodes(
          context.getStore(),
          planNode.id,
          args.shots.length,
        );
        if (existing) shotNodes = existing;
        else
          shotNodes = await createStoryboardGraph({
            store: context.getStore(),
            planNode: livePlan,
            scriptNode: liveScript,
            args,
            context,
            routes,
          });
        ids = shotNodes[index];
      }
      const currentNodes = context.getStore().nodes;
      const imageNode = currentNodes.find((node) => node.id === ids.shotImage);
      const videoNode = currentNodes.find((node) => node.id === ids.shotVideo);
      const imagePlatform = platformHasOpenTab(imageNode.data.platform, routes)
        ? imageNode.data.platform
        : routes.image;
      const videoPlatform = platformHasOpenTab(videoNode.data.platform, routes)
        ? videoNode.data.platform
        : routes.video;
      const routeUpdates = [
        { node: imageNode, platform: imagePlatform },
        { node: videoNode, platform: videoPlatform },
      ]
        .filter(
          ({ node, platform }) =>
            node.data.executionMode !== "chat" ||
            node.data.platform !== platform,
        )
        .map(({ node, platform }) => ({
          nodeId: node.id,
          data: { executionMode: "chat", platform },
        }));
      if (routeUpdates.length > 0)
        await context.getStore().batchUpdateNodes(routeUpdates);
      // Separate runs persist each browser call before advancing to the next shot.
      const image = await runWorkflowTool.execute(
        { nodeIds: [ids.shotImage] },
        context,
      );
      results[index] = {
        number,
        imageNodeId: ids.shotImage,
        videoNodeId: ids.shotVideo,
        image,
      };
      if (image.status !== "completed") {
        return {
          status: image.status,
          shots: results,
          nextShot: number,
          retryable: true,
          externalWebsiteCost: "unknown",
        };
      }
      const video = await runWorkflowTool.execute(
        { nodeIds: [ids.shotVideo] },
        context,
      );
      results[index].video = video;
      if (video.status !== "completed") {
        return {
          status: video.status,
          shots: results,
          nextShot: number,
          retryable: true,
          externalWebsiteCost: "unknown",
        };
      }
      index += 1;
    }
    return {
      status: context.signal?.aborted ? "stopped" : "completed",
      shots: results,
      externalWebsiteCost: "unknown",
    };
  },
  presentCall(args) {
    return {
      title: t("nodeStore.videoScript.building", {
        count: args.shots?.length ?? 0,
      }),
      icon: "clapperboard",
    };
  },
  presentResult(_args, result) {
    return {
      title: t("nodeStore.videoScript.progress", {
        count: result.shots?.length ?? 0,
      }),
      status: result.status === "completed" ? "completed" : "in_progress",
    };
  },
};
