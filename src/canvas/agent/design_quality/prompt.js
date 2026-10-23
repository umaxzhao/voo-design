/**
 * Builds the appended "Design quality" block for the agent system prompt:
 * tokens-first workflow, hierarchy rules, anti-AI-smell rules, Dribbble-human
 * principles, the chosen kit block, and 3-4 text exemplars.
 */
import { pickStyleKit } from "./style_kits.js";
import { pickExemplars } from "./exemplars.js";
import { DESIGN_TOKENS } from "./tokens.js";

export function buildDesignQualityPrompt({ userText, kit } = {}) {
  const activeKit = kit && STYLE_KIT_SHAPE_OK(kit) ? kit : pickStyleKit(userText);
  const exemplars = pickExemplars(userText, 4, activeKit?.id);
  const palette = activeKit?.palette ?? DESIGN_TOKENS.palettes.light;
  const scale = (activeKit?.typeScale ?? DESIGN_TOKENS.typeScale).join(" ");
  const radius = activeKit?.radius ?? DESIGN_TOKENS.radii;

  return [
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
    "1. Choose the kit above and apply its tokens (background, surfaces, hairline borders, text colors, accent) as variables/styles before drawing.",
    "2. Structure first: default to auto-layout frames for UI generation (horizontal/vertical, 4-multiple gap and padding), not hand-placed boxes. Reserve layout: \"none\" for posters, free-form art, or intentional absolute placement.",
    "3. Build components/rows once and repeat with real content; wire fills to tokens.",
    "4. Content last, but never lorem: real names, prices, dates, counts, avatar initials, status pills.",
    "5. Verify: capture_canvas, then fix overlap/overflow/alignment/type/contrast mistakes before replying.",
    "",
    "[Visual hierarchy]",
    "One focal element at >=2x the area of its peers; supporting elements stay small.",
    "Big scale contrast between display type and body (>=2x, e.g. 48-72px vs 14-16px); never a wall of same-size text.",
    "Group related items tightly (8-12px) and keep generous space between groups (32-64px): vary the rhythm.",
    "Left-align content by default; exact left edges aligned within every group.",
    "",
    "[Anti-AI-smell — an automatic fail]",
    "No purple/violet-to-blue/pink gradients and no glow blobs.",
    "No rows of 3+ identical sibling cards with the same size/radius/fill; break the grid, emphasize one module.",
    "No fully centered stacked hero (centered headline + centered sub + centered button); go asymmetric.",
    "No decorative thin lines, random pills, or empty blobs that mean nothing.",
    "No evenly spaced template grid with no focal element; every section must differ.",
    "",
    "[Dribbble-human principles]",
    "Design like a popular product shot: one dominant module, restrained palette with one signal accent (5-10% of the surface), dark+near-black with a vivid accent OR warm neutral light.",
    "Precise type: 2 families max, strong scale contrast, tabular numbers, aligned baselines.",
    "Real-feeling content everywhere: realistic names (\"Amara Kessie\"), amounts ($48,230), dates (\"Mar 14, 09:41\"), avatar initials (AK), tiny charts (sparklines, donuts, bar rows), status dots/pills.",
    "Polish: 1px hairlines instead of heavy borders, soft layered shadows on the 1-2 elevated modules only, consistent icon style, deliberate asymmetry.",
    "",
    exemplars.length
      ? "[Exemplar recipes — follow the nearest one]\n" + exemplars.map((e, i) => e.structureOnly
        ? `${i + 1}. (${e.kit}; structure only, restyle with the active kit) ${e.structure}`
        : `${i + 1}. (${e.kit}) ${e.description}`).join("\n")
      : "",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

function STYLE_KIT_SHAPE_OK(kit) {
  return Boolean(
    kit && typeof kit === "object" && kit.id && kit.name && kit.palette && kit.fonts && kit.mood,
  );
}
