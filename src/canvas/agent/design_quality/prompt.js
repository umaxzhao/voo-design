import { fromStyleKit } from '../design_system/from_style_kit.js';
import { designSystemPromptBlock } from '../design_system/apply.js';
/**
 * Builds the appended "Design quality" block for the agent system prompt:
 * tokens-first workflow, hierarchy rules, anti-AI-smell rules, Dribbble-human
 * principles, the chosen kit block, and 3-4 text exemplars.
 */
import { STYLE_KITS, pickStyleKit } from "./style_kits.js";
import { pickExemplars } from "./exemplars.js";
import { DESIGN_TOKENS } from "./tokens.js";
import { sceneGuidePromptBlock } from "./scene_guides.js";

export function buildDesignQualityPrompt({ userText, kit, designSystem, sceneKind = null } = {}) {
  const activeKit = STYLE_KITS[designSystem?.id] ?? (kit && STYLE_KIT_SHAPE_OK(kit) ? kit : pickStyleKit(userText));
  const exemplars = pickExemplars(userText, 4, activeKit?.id);
  const palette = activeKit?.palette ?? DESIGN_TOKENS.palettes.light;
  const scale = (activeKit?.typeScale ?? DESIGN_TOKENS.typeScale).join(" ");
  const radius = activeKit?.radius ?? DESIGN_TOKENS.radii;

  const kitInstructions = [
    "=== Design quality (follow strictly) ===",
    `Style kit: ${activeKit.name} — ${activeKit.mood} Use this ONE kit for the ENTIRE design; never mix kits or inject other palettes.`,
    "",
    "[Kit tokens]",
    `Palette: bg ${palette.bg}, surface ${palette.surface}, surfaceAlt ${palette.surfaceAlt}, border ${palette.border}, text ${palette.text}, textMuted ${palette.textMuted}, accent ${palette.accent} (accent text ${palette.accentText}), success ${palette.success}, warning ${palette.warning}, danger ${palette.danger}.`,
    `Fonts: display \"${activeKit.fonts.display}\", body \"${activeKit.fonts.body}\", mono \"${activeKit.fonts.mono}\". 2 families max.`,
    `Type scale (px): ${scale}. Radius: sm ${radius.sm}, md ${radius.md}, lg ${radius.lg}. Spacing density: ${activeKit.spacingDensity}. Grid: multiples of 4.`,
    `Layout patterns: ${activeKit.layoutPatterns.join("; ")}.`,
    `Do: ${activeKit.dos.join("; ")}.`,
    `Don't: ${activeKit.donts.join("; ")}.`,
    "",
    "[Workflow — tokens first]",
    "1. Build the complete screen with build_layout in 1-3 calls: include every section, real copy, and all text. For one poster or page, use one top-level Frame and nest all visual and editable text layers beneath it; create multiple root Frames only for separate variants. You may batch multiple tool calls in one step.",
    "2. Set colours and fonts directly from the style kit tokens on each node; do not spend calls on separate bind_variable operations or token creation.",
    "3. Structure responsive UI with Auto Layout frames: direction, wrap, per-side padding, item/line gaps, alignment and distribution. Use fixed/hug frame sizing and fixed/hug/fill child sizing; use absolute positioning only for overlays. Keep free-form art unmanaged. Repeat components/rows with real names, prices, dates, counts, initials and status pills.",
    "4. Avoid hand-drawn path illustrations; use simple shapes or image placeholders.",
    "5. After the complete screen is built, capture_canvas once and inspect_layout, review the image and reported issues, then fix overlap/overflow/alignment/type/contrast mistakes before replying.",
    "",
    "[Visual hierarchy]",
    "One focal element at >=2x the area of its peers; supporting elements stay small.",
    "Big scale contrast between display type and body (>=2x, e.g. 48-72px vs 14-16px); never a wall of same-size text.",
    "Group related items tightly (8-12px) and keep generous space between groups (32-64px): vary the rhythm.",
    "Left-align content by default; exact left edges aligned within every group.",
    "",
    "[Anti-AI-smell — an automatic fail]",
    "No purple/violet-to-blue/pink gradients and no glow blobs.",
    "No decorative emoji, sparks or stars (✦, ⚡, ✨, ●, ★, 🔥, 🚀) in labels, tags, buttons or titles — functional monochrome only (Impeccable/Unslop standard).",
    "No box-in-a-box nesting: do not wrap every section in bordered rounded cards. Differentiate structure through spatial whitespace, typography scale, and subtle background lightness steps.",
    "No pseudo-science AI buzzword filler (e.g. 'Quantum Cognitive Neural Architecture'). Use concise, authentic, domain-accurate language.",
    "No rows of 3+ identical sibling cards with the same size/radius/fill; break the grid, emphasize one module.",
    "No fully centered stacked hero (centered headline + centered sub + centered button); go asymmetric.",
    "No decorative thin lines, random pills, or empty blobs that mean nothing.",
    "No evenly spaced template grid with no focal element; every section must differ.",
    "Graphic design brand guidelines are NOT software dashboards: do NOT draw fake UI buttons, code blocks, or latency meters in brand identity manuals. Use 60%+ whitespace, pure geometric marks, proportional color fields with Pantone/CMYK specs, and editorial type specimens (Swiss International Style).",
    "",
    "[Dribbble-human principles & MotionSites impact]",
    "Dramatic scale contrast: use bold 36-84px display typography paired with delicate 9-11px technical micro-notations.",
    "Design like a popular product shot: one dominant module (>=2x area of peers), restrained palette with one signal accent (5-10% of the surface), dark+near-black with a vivid accent OR warm neutral light.",
    "Precise type: 2 families max, strong scale contrast, tabular numbers, aligned baselines, generous 48-80px whitespace.",
    "Real-feeling content everywhere: realistic names (\"Amara Kessie\"), amounts ($48,230), dates (\"Mar 14, 09:41\"), avatar initials (AK), tiny charts (sparklines, donuts, bar rows), status dots/pills.",
    "Polish: 1px hairlines instead of heavy borders, soft layered shadows on the 1-2 elevated modules only, consistent icon style, deliberate asymmetry.",
    "",
    exemplars.length
      ? "[Exemplar recipes — follow the nearest one]\n" + exemplars.map((e, i) => (e.structureOnly || designSystem)
        ? `${i + 1}. (${e.kit}; structure only, restyle with the active kit) ${e.structure}`
        : `${i + 1}. (${e.kit}) ${e.description}`).join("\n")
      : "",
    sceneGuidePromptBlock(sceneKind),
  ];
  if (designSystem) {
    kitInstructions.splice(1, 10, designSystemPromptBlock(designSystem));
    const instruction = kitInstructions.findIndex(s => s.startsWith("2. Set colours"));
    kitInstructions[instruction] = "2. Set colours and fonts directly from the active design system contract on each node.";
  } else {
    kitInstructions.splice(1, 0, designSystemPromptBlock(fromStyleKit(activeKit)));
  }
  return kitInstructions
    .filter((s) => s.length > 0)
    .join("\n");
}

function STYLE_KIT_SHAPE_OK(kit) {
  return Boolean(
    kit && typeof kit === "object" && kit.id && kit.name && kit.palette && kit.fonts && kit.mood,
  );
}
