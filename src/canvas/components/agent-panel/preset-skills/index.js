/** Verified upstream SKILL.md packages bundled without rewriting instructions. */
import { parseExternalSkill } from "../skill_descriptors.js";
import {
  BETTER_WRITING_MARKDOWN,
  DESIGN_FIRST_UI_PROMPTING_MARKDOWN,
  FRONTEND_DESIGN_MARKDOWN,
  SEEDANCE_PROMPT_MARKDOWN,
} from "./original-skill-sources.js";
import {
  EMIL_DESIGN_ENG_MARKDOWN,
  REDESIGN_EXISTING_PROJECTS_MARKDOWN,
} from "./skills-sh-sources.js";

const SOURCES = [
  {
    markdown: EMIL_DESIGN_ENG_MARKDOWN,
    author: "Emil Kowalski",
    license: "MIT",
    sourceUrl:
      "https://github.com/emilkowalski/skill/tree/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128/skills/emil-design-eng",
    sourceRevision: "d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128",
    category: "design",
    icon: "IconLayout",
    nameKey: "nodeStore.preset.emilDesignEng.name",
    descriptionKey: "nodeStore.preset.emilDesignEng.description",
  },
  {
    markdown: REDESIGN_EXISTING_PROJECTS_MARKDOWN,
    author: "Leonxlnx",
    license: "MIT",
    sourceUrl:
      "https://github.com/leonxlnx/taste-skill/tree/ce26fc25c0e5e8cab638f883de62d9a86ee5e45b/skills/redesign-skill",
    sourceRevision: "ce26fc25c0e5e8cab638f883de62d9a86ee5e45b",
    category: "design",
    icon: "IconLayout",
    nameKey: "nodeStore.preset.redesignExistingProjects.name",
    descriptionKey: "nodeStore.preset.redesignExistingProjects.description",
  },
  {
    markdown: FRONTEND_DESIGN_MARKDOWN,
    author: "Anthropic, PBC",
    license: "Apache-2.0",
    sourceUrl:
      "https://github.com/anthropics/skills/tree/33375500bcea98d610eb30ce10ac4e59b89c390d/skills/frontend-design",
    sourceRevision: "33375500bcea98d610eb30ce10ac4e59b89c390d",
    category: "design",
    icon: "IconLayout",
    nameKey: "nodeStore.preset.frontendDesign.name",
    descriptionKey: "nodeStore.preset.frontendDesign.description",
  },
  {
    markdown: SEEDANCE_PROMPT_MARKDOWN,
    author: "dexhunter",
    license: "MIT",
    sourceUrl:
      "https://github.com/dexhunter/seedance2-skill/tree/516284d5bab58361bfdfed3cc96cee3e837d4c44",
    sourceRevision: "516284d5bab58361bfdfed3cc96cee3e837d4c44",
    category: "video",
    icon: "IconFilm",
    nameKey: "nodeStore.preset.seedancePrompt.name",
    descriptionKey: "nodeStore.preset.seedancePrompt.description",
  },
  {
    markdown: DESIGN_FIRST_UI_PROMPTING_MARKDOWN,
    author: "Meng To",
    license: "MIT",
    sourceUrl:
      "https://github.com/MengTo/Skills/tree/a965851e27dc179e693fde1bee94457a64e1a7a5/agent-skills/ui/design-first-ui-prompting",
    sourceRevision: "a965851e27dc179e693fde1bee94457a64e1a7a5",
    category: "design",
    icon: "IconLayout",
    nameKey: "nodeStore.preset.designFirstUiPrompting.name",
    descriptionKey: "nodeStore.preset.designFirstUiPrompting.description",
  },
  {
    markdown: BETTER_WRITING_MARKDOWN,
    author: "Jakub Krehel",
    license: "MIT",
    sourceUrl:
      "https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-writing",
    sourceRevision: "267330e1adfc66a718fb65fa6918c1f06d0a689e",
    category: "design",
    icon: "IconText",
    nameKey: "nodeStore.preset.betterWriting.name",
    descriptionKey: "nodeStore.preset.betterWriting.description",
  },
];

function makePreset(source) {
  const parsed = parseExternalSkill(source.markdown, "preset");
  if (!parsed.ok) {
    throw new Error(`Invalid bundled SKILL.md: ${parsed.error.code}`);
  }
  return Object.freeze({
    ...parsed.skill,
    author: source.author,
    license: source.license,
    sourceUrl: source.sourceUrl,
    sourceRevision: source.sourceRevision,
    category: source.category,
    icon: source.icon,
    nameKey: source.nameKey,
    descriptionKey: source.descriptionKey,
    badge: source.license,
  });
}

const PRESET_SKILL_MAP = new Map(
  SOURCES.map((source) => {
    const skill = makePreset(source);
    return [skill.id, skill];
  }),
);

export const PRESET_SKILL_CATALOG = Object.freeze(
  [...PRESET_SKILL_MAP.values()].map((skill) =>
    Object.freeze({
      id: `preset:${skill.id}`,
      presetId: skill.id,
      name: skill.name,
      version: skill.version,
      category: skill.category,
      author: skill.author,
      license: skill.license,
      sourceUrl: skill.sourceUrl,
      sourceRevision: skill.sourceRevision,
      nameKey: skill.nameKey,
      descriptionKey: skill.descriptionKey,
      icon: skill.icon,
      badge: skill.badge,
      tags: [...skill.triggers],
      isPreset: true,
    }),
  ),
);

export function getPresetSkill(id) {
  if (!id || typeof id !== "string") return null;
  const cleanId = id.startsWith("preset:") ? id.slice("preset:".length) : id;
  return PRESET_SKILL_MAP.get(cleanId) ?? null;
}

export function findPresetCatalogItem(id) {
  if (!id || typeof id !== "string") return null;
  return (
    PRESET_SKILL_CATALOG.find(
      (item) => item.id === id || item.presetId === id,
    ) ?? null
  );
}

export default PRESET_SKILL_CATALOG;
