import {
  PRESET_SKILL_CATALOG,
  PRESET_SKILL_METADATA,
} from "./agent-panel/preset-skills/catalog.js";

export function buildNodeStoreSkills(externalSkills) {
  const skills = [...PRESET_SKILL_CATALOG];
  for (const skill of externalSkills) {
    if (skill.source === "preset") continue;
    skills.push({
      id: `custom:${skill.id}`,
      name: skill.name,
      description: skill.description,
      category: skill.category || "design",
      categories: [skill.category || "design"],
      icon: "IconPuzzle",
      badge: skill.version,
      tags: skill.triggers || [],
      isCustom: true,
      skillRecord: skill,
    });
  }
  return skills;
}

/** Use the left catalog's identities and order for the Agent composer. */
export function buildComposerSkills(externalSkills) {
  return buildNodeStoreSkills(externalSkills).map((item) => {
    if (item.isCustom) return item.skillRecord;
    const installed = externalSkills.find(
      (skill) => skill.source === "preset" && skill.id === item.presetId,
    );
    return {
      ...PRESET_SKILL_METADATA.find((skill) => skill.id === item.presetId),
      ...(installed ?? {}),
      enabled: installed?.enabled !== false && Boolean(installed),
    };
  });
}
