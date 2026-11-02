export default {
  "agent.skill.gameAssets": "Scene to game assets",
  "agent.skill.gameAssetsDesc":
    "Concept image → editable elements → isolated images → 3D assets",
  "gameAssets.promptTitle": "{name} · Element prompt",
  "gameAssets.imageTitle": "{name} · Element image",
  "gameAssets.modelTitle": "{name} · 3D asset",
  "agent.tool.buildGameAssets.call": "Build {count} game asset branches…",
  "agent.tool.buildGameAssets.result": "Built {count} game asset branches",
  "gameAssets.error.invalidElement":
    "Each asset needs a unique lowercase key, name, image prompt, and 3D prompt.",
  "gameAssets.error.incompleteBranch":
    "Asset {key} has missing nodes. Repair that branch before adding more.",
  "gameAssets.error.missingConcept": "The concept image node is missing.",
  "gameAssets.error.invalidSource": "The concept node must output an image.",
  "gameAssets.error.conceptEmpty":
    "Generate or choose the concept image before creating its asset branches.",
  "gameAssets.error.count": "Choose 1 to {count} game assets.",
  "gameAssets.error.creationUnavailable": "Canvas creation is unavailable.",
  "gameAssets.error.creationIncomplete":
    "The asset workflow was not completed.",
};
