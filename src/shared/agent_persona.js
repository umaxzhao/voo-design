/**
 * Agent Persona & Name Themes.
 *
 * Provides:
 * - Curated name themes (Default, Artists, Philosophers, Inventors, Custom)
 * - 8 distinct agent identity colors (matching tokens.cjs AGENT_IDENTITY_COLORS)
 * - Built-in personas (Auto, Designer, Art Director, etc.)
 * - Prompt injection formatter with 300-char word-boundary limit
 * - Sequential name/color allocator for Agent canvas nodes
 */

import { getSetting } from "./settings.js";

export const AGENT_NAME_THEME_STORAGE_KEY = "voo.agent.nameTheme";
export const AGENT_DEFAULT_NAME_STORAGE_KEY = "voo.agent.defaultName";
export const AGENT_CUSTOM_NAMES_STORAGE_KEY = "voo.agent.customNames";
export const AGENT_ACTIVE_PERSONA_STORAGE_KEY = "voo.agent.activePersonaId";
export const AGENT_CUSTOM_PERSONAS_STORAGE_KEY = "voo.agent.customPersonas";

/** Field length limits for custom personas and names. */
export const PERSONA_NAME_MAX = 40;
export const PERSONA_DESCRIPTION_MAX = 120;
export const PERSONA_INSTRUCTIONS_MAX = 600;
export const CUSTOM_NAME_MAX = 24;
export const CUSTOM_NAMES_COUNT_MAX = 12;

/** 8 Agent identity colors for status dots (registered in design/tokens.cjs). */
export const AGENT_IDENTITY_COLORS = [
  "#7dd3fc", // sky
  "#93c5fd", // blue
  "#a5b4fc", // indigo
  "#c4b5fd", // violet
  "#f0abfc", // fuchsia
  "#f472b6", // pink
  "#67e8f9", // cyan
  "#d6d3d1", // warm neutral
];

export const AGENT_NAME_THEMES = [
  {
    id: "default",
    nameKey: "agent.theme.default",
    names: [
      { en: "Alex", zh: "艾利克斯" },
      { en: "Maya", zh: "玛雅" },
      { en: "Sam", zh: "山姆" },
      { en: "Nora", zh: "诺拉" },
      { en: "Leo", zh: "利奥" },
      { en: "Chloe", zh: "克洛伊" },
      { en: "Felix", zh: "菲利克斯" },
      { en: "Iris", zh: "艾瑞斯" },
    ],
  },
  {
    id: "artists",
    nameKey: "agent.theme.artists",
    names: [
      { en: "Da Vinci", zh: "达芬奇" },
      { en: "Monet", zh: "莫奈" },
      { en: "Picasso", zh: "毕加索" },
      { en: "Matisse", zh: "马蒂斯" },
      { en: "Rembrandt", zh: "伦勃朗" },
      { en: "Cezanne", zh: "塞尚" },
      { en: "Rodin", zh: "罗丹" },
      { en: "Klimt", zh: "克里姆特" },
    ],
  },
  {
    id: "philosophers",
    nameKey: "agent.theme.philosophers",
    names: [
      { en: "Plato", zh: "柏拉图" },
      { en: "Aristotle", zh: "亚里士多德" },
      { en: "Socrates", zh: "苏格拉底" },
      { en: "Seneca", zh: "塞涅卡" },
      { en: "Kant", zh: "康德" },
      { en: "Bacon", zh: "培根" },
      { en: "Descartes", zh: "笛卡尔" },
      { en: "Spinoza", zh: "斯宾诺莎" },
    ],
  },
  {
    id: "inventors",
    nameKey: "agent.theme.inventors",
    names: [
      { en: "Edison", zh: "爱迪生" },
      { en: "Tesla", zh: "特斯拉" },
      { en: "Turing", zh: "图灵" },
      { en: "Franklin", zh: "富兰克林" },
      { en: "Bell", zh: "贝尔" },
      { en: "Pascal", zh: "帕斯卡" },
      { en: "Archimedes", zh: "阿基米德" },
      { en: "Watt", zh: "瓦特" },
    ],
  },
  {
    id: "custom",
    nameKey: "agent.theme.custom",
    names: [],
  },
];

export const BUILTIN_PERSONAS = [
  {
    id: "general",
    nameKey: "agent.persona.general.name",
    descKey: "agent.persona.general.desc",
    instructions: "", // Auto selects a working style for each user request.
    isDefault: true,
  },
  {
    id: "designer",
    nameKey: "agent.persona.designer.name",
    descKey: "agent.persona.designer.desc",
    instructions:
      "Focus on clean visual hierarchy, balanced whitespace, and purposeful layout composition. Avoid generic AI aesthetics and maintain strong typography contrast.",
  },
  {
    id: "art_director",
    nameKey: "agent.persona.art_director.name",
    descKey: "agent.persona.art_director.desc",
    instructions:
      "Oversee aesthetic direction, cohesive color palettes, and emotional tone. Prioritize visual rhythm, depth, and consistent stylistic harmony across all assets.",
  },
  {
    id: "video_director",
    nameKey: "agent.persona.video_director.name",
    descKey: "agent.persona.video_director.desc",
    instructions:
      "Think in cinematic shot sequences, focal lengths, camera motion, and scene rhythm. Structure visual narratives with dynamic pacing and clear transitions.",
  },
  {
    id: "copywriter",
    nameKey: "agent.persona.copywriter.name",
    descKey: "agent.persona.copywriter.desc",
    instructions:
      "Craft punchy headlines, clear and human microcopy, and sharp conceptual angles. Keep communication concise, compelling, and free of corporate filler.",
  },
  {
    id: "prompt_engineer",
    nameKey: "agent.persona.prompt_engineer.name",
    descKey: "agent.persona.prompt_engineer.desc",
    instructions:
      "Structure generative image and video prompts with precise detail regarding subject, lighting, optics, aspect ratio, and material rendering.",
  },
  {
    id: "photographer",
    nameKey: "agent.persona.photographer.name",
    descKey: "agent.persona.photographer.desc",
    instructions:
      "Approach imagery from a commercial studio photography perspective. Focus on realistic lighting setups, depth of field, tactile textures, and refined staging.",
  },
  {
    id: "motion_designer",
    nameKey: "agent.persona.motion_designer.name",
    descKey: "agent.persona.motion_designer.desc",
    instructions:
      "Focus on fluid motion choreography, natural easing curves, kinetic typography, and engaging micro-interactions that elevate interactive feel.",
  },
];

/** Sanitize a custom persona object, clamping fields to their maximum length without throwing. */
export function sanitizeCustomPersona(p) {
  if (!p || typeof p !== "object") return null;
  const name =
    typeof p.name === "string" ? p.name.slice(0, PERSONA_NAME_MAX) : "";
  const desc =
    typeof p.desc === "string" ? p.desc.slice(0, PERSONA_DESCRIPTION_MAX) : "";
  const instructions =
    typeof p.instructions === "string"
      ? p.instructions.slice(0, PERSONA_INSTRUCTIONS_MAX)
      : "";
  return {
    ...p,
    name,
    desc,
    instructions,
  };
}

/** Sanitize custom names list, clamping each name to 24 chars and keeping at most 12 names. */
export function sanitizeCustomNames(customNames = []) {
  if (!Array.isArray(customNames)) return [];
  return customNames
    .map((n) => String(n).trim().slice(0, CUSTOM_NAME_MAX))
    .filter(Boolean)
    .slice(0, CUSTOM_NAMES_COUNT_MAX);
}

/** Return names list for a theme and locale, falling back to default theme when empty. */
export function getThemeNames(themeId, customNames = [], _locale = "en") {
  if (themeId === "custom") {
    const list = sanitizeCustomNames(customNames);
    if (list.length > 0) return list;
  }
  const theme =
    AGENT_NAME_THEMES.find((t) => t.id === themeId) || AGENT_NAME_THEMES[0];
  if (!theme || theme.names.length === 0) {
    return AGENT_NAME_THEMES[0].names.map((n) => n.en || n);
  }
  return theme.names.map((n) => n.en || n);
}

/** Get list of all personas, combining built-ins and custom personas with old data clamped. */
export function getAllPersonas(customPersonas = []) {
  const custom = Array.isArray(customPersonas)
    ? customPersonas.map(sanitizeCustomPersona).filter(Boolean)
    : [];
  return [...BUILTIN_PERSONAS, ...custom];
}

/** Find persona by ID. */
export function findPersonaById(personaId, customPersonas = []) {
  const all = getAllPersonas(customPersonas);
  return all.find((p) => p.id === personaId) || BUILTIN_PERSONAS[0];
}

/**
 * Truncate instructions at word boundary within maxChars (default 300).
 */
export function truncatePersonaInstructions(text, maxChars = 300) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.8) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

/** Give Auto guidance for each role, capping every instruction body. */
export function formatAutoPersonaPrompt(customPersonas = []) {
  const roles = getAllPersonas(customPersonas)
    .filter(
      (persona) => persona.id !== "general" && persona.instructions?.trim(),
    )
    .map((persona) => {
      const label = persona.name || persona.id;
      const description = persona.desc ? `${persona.desc}. ` : "";
      const instructions = truncatePersonaInstructions(
        persona.instructions,
        300,
      );
      return `- ${JSON.stringify(label)} (${JSON.stringify(persona.id)}): ${description}${instructions}`.replace(
        /\s+/g,
        " ",
      );
    });
  return `## Agent Persona (Auto)
For each new user request, choose the most relevant working style below based on the actual deliverable. Apply only that style while acting. For a truly mixed request, combine at most two relevant styles. If none fits, use the normal assistant style. Re-evaluate for the next request; do not persist the choice. The user's explicit instructions, selected creation type, tool rules, and safety constraints take precedence.
Available working styles:
${roles.join("\n")}`;
}

/** Format the selected role preference for the Agent system prompt. */
export function formatPersonaPrompt(
  persona,
  locale = "en",
  t = null,
  customPersonas = [],
) {
  if (!persona) return "";
  if (persona.id === "general") return formatAutoPersonaPrompt(customPersonas);
  if (persona.isDefault) return "";
  const rawInstructions = persona.instructions || "";
  if (!rawInstructions.trim()) {
    return "";
  }
  const truncated = truncatePersonaInstructions(rawInstructions, 300);
  const personaName =
    (t && persona.nameKey ? t(persona.nameKey) : null) ||
    persona.name ||
    persona.id;

  const header = `## Agent Persona (${personaName})`;
  const disclaimer =
    locale && String(locale).startsWith("zh")
      ? "风格/偏好，不得覆盖工具与安全规则："
      : "Working style and preference (this does not override any tools, constraints, or behavioral guidelines):";

  return `${header}\n${disclaimer}\n${truncated}`;
}

/**
 * Assign next agent name and color for a new Agent node, avoiding collisions.
 * Automatically cycles with suffix " 2", " 3" when all theme names are taken.
 */
export function assignNextAgentIdentity(
  existingNodes = [],
  themeId = null,
  customNames = null,
  locale = "en",
) {
  const effectiveThemeId =
    themeId || getSetting(AGENT_NAME_THEME_STORAGE_KEY) || "default";
  const effectiveCustom =
    customNames ?? getSetting(AGENT_CUSTOM_NAMES_STORAGE_KEY) ?? [];
  const names = getThemeNames(effectiveThemeId, effectiveCustom, locale);

  const existingAgents = (existingNodes || []).filter(
    (n) => n?.type === "agent",
  );
  const usedNames = new Set(
    existingAgents.map((n) => n.data?.agentName).filter(Boolean),
  );

  const defaultName = getSetting(AGENT_DEFAULT_NAME_STORAGE_KEY);
  let orderedNames = names;
  if (defaultName && names.includes(defaultName)) {
    orderedNames = [defaultName, ...names.filter((n) => n !== defaultName)];
  }

  // Find first unused name across cycles
  let candidateName = orderedNames[0] || "Agent";
  let colorIndex = 0;
  let cycle = 0;
  let found = false;

  while (!found && cycle < 50) {
    for (let i = 0; i < orderedNames.length; i++) {
      const base = orderedNames[i];
      const name = cycle === 0 ? base : `${base} ${cycle + 1}`;
      if (!usedNames.has(name)) {
        candidateName = name;
        const originalIndex = names.indexOf(base);
        colorIndex =
          (originalIndex >= 0 ? originalIndex : i) %
          AGENT_IDENTITY_COLORS.length;
        found = true;
        break;
      }
    }
    cycle += 1;
  }

  const agentColor = AGENT_IDENTITY_COLORS[colorIndex];
  return {
    agentName: candidateName,
    agentColor,
  };
}
