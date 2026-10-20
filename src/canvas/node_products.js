import { HANDLE, NODE_TYPE, createNode } from "./nodes/types.js";
import { getPresetSkill } from "./components/agent-panel/preset-skills/index.js";
import { t } from "../shared/i18n.js";
import { getNodeVisualSize } from "./node-position.js";

export { NODE_PRODUCT_ID, NODE_PRODUCTS } from "./node-product-catalog.js";
import { NODE_PRODUCT_ID } from "./node-product-catalog.js";

function makeEdge(sourceId, sourceHandle, targetId, targetHandle) {
  return {
    id: `edge-${sourceId}-${targetId}`,
    source: sourceId,
    sourceHandle,
    target: targetId,
    targetHandle,
    type: "default",
    animated: false,
  };
}

/** Creates the entry node or pipeline graph for a skill product. */
export function createNodeProduct(productId, position, labels = {}) {
  if (productId === NODE_PRODUCT_ID.VIDEO_SCRIPT) {
    const nodeGap = 80;
    const source = createNode(NODE_TYPE.PROMPT, position, {
      title: t("nodeStore.videoScript.source"),
      text: "",
      productId,
      workflowRole: "story",
    });
    source.data.workflowRootId = source.id;
    const script = createNode(
      NODE_TYPE.PROMPT,
      {
        x: source.position.x + getNodeVisualSize(source).width + nodeGap,
        y: position.y,
      },
      {
        title: t("nodeStore.videoScript.script"),
        aiPrompt: t("nodeStore.videoScript.scriptPrompt"),
        productId,
        workflowRole: "scriptGenerator",
        workflowRootId: source.id,
        workflowParentId: source.id,
      },
    );
    const storyboard = createNode(
      NODE_TYPE.STORYBOARD,
      {
        x: script.position.x + getNodeVisualSize(script).width + nodeGap,
        y: position.y,
      },
      {
        title: t("nodeStore.videoScript.storyboard"),
        productId,
        workflowRole: "storyboardPlan",
        workflowRootId: source.id,
        workflowParentId: script.id,
      },
    );
    const video = createNode(
      NODE_TYPE.VIDEO,
      {
        x:
          storyboard.position.x + getNodeVisualSize(storyboard).width + nodeGap,
        y: position.y,
      },
      {
        title: t("nodeStore.videoScript.video"),
        productId,
        workflowRole: "storyboardVideo",
        workflowRootId: source.id,
        workflowParentId: storyboard.id,
      },
    );
    return {
      nodes: [source, script, storyboard, video],
      edges: [
        makeEdge(source.id, HANDLE.TEXT, script.id, HANDLE.TEXT),
        makeEdge(script.id, HANDLE.TEXT, storyboard.id, HANDLE.TEXT),
        makeEdge(storyboard.id, HANDLE.STORYBOARD, video.id, HANDLE.STORYBOARD),
      ],
    };
  }
  if (productId === NODE_PRODUCT_ID.SHORT_VIDEO_CUSTOM) {
    const script = createNode(NODE_TYPE.PROMPT, position, {
      text: "",
      aiPrompt: labels.storyPrompt,
      title: labels.storyTitle,
      productId,
      workflowRole: "story",
    });
    script.data.workflowRootId = script.id;
    return { nodes: [script], edges: [] };
  }

  if (productId === NODE_PRODUCT_ID.STORYBOARD_BATCH) {
    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y },
      {
        title: labels.storyboardTitle || t("nodeStore.storyboard.promptTitle"),
        text: "1. 晨光熹微，主角站在屋顶俯瞰赛博都市。\n2. 镜头下推，主角手中的通讯器亮起红色警告。\n3. 特写镜头，眼神锐利坚定。\n4. 跃下天台，滑翔翼展开穿梭于霓虹楼宇之间。",
      },
    );
    const batch = createNode(
      NODE_TYPE.BATCH,
      { x: position.x + 560, y: position.y },
      { title: t("nodeStore.storyboard.batchTitle") },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 880, y: position.y },
      { title: t("nodeStore.storyboard.groupTitle") },
    );
    return {
      nodes: [prompt, batch, group],
      edges: [
        makeEdge(prompt.id, HANDLE.TEXT, batch.id, HANDLE.TEXT),
        makeEdge(batch.id, HANDLE.IMAGE, group.id, HANDLE.MEDIA),
      ],
    };
  }

  if (productId === NODE_PRODUCT_ID.PHOTO_TO_POSTER) {
    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y },
      {
        title: t("nodeStore.poster.promptTitle"),
        text: "主标题: FUTURE HORIZON 2026\n副标题: Annual Creative Design Summit\n视觉风格: 电影质感、高对比布光、极简现代版式\n配色: 深黑与荧光绿",
      },
    );
    const generate = createNode(
      NODE_TYPE.GENERATE,
      { x: position.x + 560, y: position.y },
      { title: t("nodeStore.poster.generateTitle") },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 880, y: position.y },
      { title: t("nodeStore.poster.groupTitle") },
    );
    return {
      nodes: [prompt, generate, group],
      edges: [
        makeEdge(prompt.id, HANDLE.TEXT, generate.id, HANDLE.TEXT),
        makeEdge(generate.id, HANDLE.IMAGE, group.id, HANDLE.MEDIA),
      ],
    };
  }

  if (productId === NODE_PRODUCT_ID.UI_UX_PRO_MAX) {
    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y },
      {
        title: t("nodeStore.uiux.promptTitle"),
        text: "产品类型: 现代暗黑风AI创作工具App\n核心页面: 1. 探索画廊 2. 创作画布 3. 个人中心\n设计原则: 4px栅格、无边框微光感、深色模式",
      },
    );
    const agent = createNode(
      NODE_TYPE.AGENT,
      { x: position.x + 560, y: position.y },
      {
        title: t("nodeStore.uiux.agentTitle"),
        brief: t("nodeStore.uiux.agentBrief"),
        outputType: "webApp",
      },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 940, y: position.y },
      { title: t("nodeStore.uiux.groupTitle") },
    );
    agent.data = { ...agent.data, outputGroupId: group.id };
    return {
      nodes: [prompt, agent, group],
      edges: [makeEdge(prompt.id, HANDLE.TEXT, agent.id, HANDLE.ALL)],
    };
  }

  if (productId === NODE_PRODUCT_ID.MULTI_STYLE_EXPLORE) {
    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y + 120 },
      {
        title: t("nodeStore.multiStyle.promptTitle"),
        text: "未来赛博都市中的机械蝴蝶，微距特写，透明发光晶体翅膀",
      },
    );
    const gen1 = createNode(
      NODE_TYPE.GENERATE,
      { x: position.x + 560, y: position.y },
      { title: t("nodeStore.multiStyle.realTitle") },
    );
    const gen2 = createNode(
      NODE_TYPE.GENERATE,
      { x: position.x + 560, y: position.y + 220 },
      { title: t("nodeStore.multiStyle.neonTitle") },
    );
    const gen3 = createNode(
      NODE_TYPE.GENERATE,
      { x: position.x + 560, y: position.y + 440 },
      { title: t("nodeStore.multiStyle.clayTitle") },
    );
    const batch = createNode(
      NODE_TYPE.BATCH,
      { x: position.x + 880, y: position.y + 220 },
      { title: t("nodeStore.multiStyle.batchTitle") },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 1200, y: position.y + 160 },
      { title: t("nodeStore.multiStyle.groupTitle") },
    );
    return {
      nodes: [prompt, gen1, gen2, gen3, batch, group],
      edges: [
        makeEdge(prompt.id, HANDLE.TEXT, gen1.id, HANDLE.TEXT),
        makeEdge(prompt.id, HANDLE.TEXT, gen2.id, HANDLE.TEXT),
        makeEdge(prompt.id, HANDLE.TEXT, gen3.id, HANDLE.TEXT),
        makeEdge(gen1.id, HANDLE.IMAGE, batch.id, HANDLE.IMAGE),
        makeEdge(gen2.id, HANDLE.IMAGE, batch.id, HANDLE.IMAGE),
        makeEdge(gen3.id, HANDLE.IMAGE, batch.id, HANDLE.IMAGE),
        makeEdge(batch.id, HANDLE.IMAGE, group.id, HANDLE.MEDIA),
      ],
    };
  }

  if (productId === NODE_PRODUCT_ID.PROMPT_PHOTO_MASTER) {
    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y },
      {
        title: t("nodeStore.photoMaster.promptTitle"),
        text: "雨夜东京街头的雨伞少年，霓虹倒影",
      },
    );
    const agent = createNode(
      NODE_TYPE.AGENT,
      { x: position.x + 560, y: position.y },
      {
        title: t("nodeStore.photoMaster.agentTitle"),
        brief: t("nodeStore.photoMaster.agentBrief"),
        outputType: "image",
      },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 940, y: position.y },
      { title: t("nodeStore.photoMaster.groupTitle") },
    );
    agent.data = { ...agent.data, outputGroupId: group.id };
    return {
      // The Agent creates and runs the image generator inside its bound Group.
      // Its artifact port is an ownership binding, never a data edge.
      nodes: [prompt, agent, group],
      edges: [makeEdge(prompt.id, HANDLE.TEXT, agent.id, HANDLE.ALL)],
    };
  }

  if (
    typeof productId === "string" &&
    (productId.startsWith("custom:") || productId.startsWith("preset:"))
  ) {
    const isPreset = productId.startsWith("preset:");
    const rawId = isPreset
      ? productId.slice("preset:".length)
      : productId.slice("custom:".length);
    const preset = isPreset ? getPresetSkill(rawId) : null;
    const customSkill =
      !isPreset && labels.customSkill?.id === rawId ? labels.customSkill : null;
    const resolvedSkill = preset || customSkill;
    const titleName = resolvedSkill?.name || rawId;

    const prompt = createNode(
      NODE_TYPE.PROMPT,
      { x: position.x, y: position.y },
      {
        title: t("nodeStore.skill.inputTitle", { name: titleName }),
        text: "",
      },
    );
    const agent = createNode(
      NODE_TYPE.AGENT,
      { x: position.x + 560, y: position.y },
      {
        label: t("nodeStore.skill.agentTitle", { name: titleName }),
        title: t("nodeStore.skill.agentTitle", { name: titleName }),
        brief:
          resolvedSkill?.instructions?.trim() ||
          t("nodeStore.skill.defaultBrief", { name: titleName }),
        instructions: resolvedSkill?.instructions || "",
        skillId: resolvedSkill?.id || rawId,
        source: isPreset ? "preset" : "custom",
        trust: resolvedSkill?.trust || "untrusted",
      },
    );
    const group = createNode(
      NODE_TYPE.GROUP,
      { x: position.x + 940, y: position.y },
      { title: t("nodeStore.skill.groupTitle", { name: titleName }) },
    );
    agent.data = { ...agent.data, outputGroupId: group.id };
    return {
      nodes: [prompt, agent, group],
      edges: [makeEdge(prompt.id, HANDLE.TEXT, agent.id, HANDLE.ALL)],
    };
  }

  return null;
}
