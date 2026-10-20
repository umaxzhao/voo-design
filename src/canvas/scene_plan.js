/** Parses numbered Chinese/English scene plans without leaking adjacent scenes. */
export function parseNumberedScenes(text) {
  const source = String(text ?? "").replace(/\r\n/g, "\n");
  const pattern =
    /(?:^|\n)\s*(?:场景|Scene)\s*(\d+)\s*[:：.-]\s*([\s\S]*?)(?=\n\s*(?:场景|Scene)\s*\d+\s*[:：.-]|$)/gi;
  const scenes = [];
  let match;
  while ((match = pattern.exec(source))) {
    const body = match[2].trim();
    if (body) scenes.push({ number: Number(match[1]), text: body });
  }
  return scenes;
}

export function sceneTextForNumber(text, sceneNumber) {
  return (
    parseNumberedScenes(text).find((scene) => scene.number === sceneNumber)
      ?.text ?? ""
  );
}

export function buildSceneExpansionContext({ plan, current, sceneNumber }) {
  const number = sceneNumber ?? "当前";
  const plannedScene = Number.isFinite(Number(sceneNumber))
    ? sceneTextForNumber(plan, Number(sceneNumber))
    : "";
  return {
    sourceText: [
      plan ? `<完整场景规划_仅供参考>\n${plan}\n</完整场景规划_仅供参考>` : "",
      plannedScene
        ? `<第${number}场原始摘要_必须遵循>\n${plannedScene}\n</第${number}场原始摘要_必须遵循>`
        : "",
      current
        ? `<第${number}场现有草稿_可修正>\n${current}\n</第${number}场现有草稿_可修正>`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    instruction: `现在只扩展第 ${number} 场。以“第${number}场原始摘要_必须遵循”中的地点、人物、核心动作和情绪变化为硬性制作目标。完整场景规划仅用于理解前后连续关系；现有草稿若与第 ${number} 场原始摘要冲突、重复了其他场景或缺少本场核心动作，必须以原始摘要为准重写。最终只输出第 ${number} 场的完整正文，绝对不要输出、复述或扩展其他场景。`,
  };
}
