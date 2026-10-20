// Design guideline data and formatting seam.
import { ANTI_SLOP_RULES } from "../../../layout-design-rules.js";

/** VOO's brand design principles, distilled from Design.md. */
export const VOO_PRINCIPLES = [
  "Deep, flat, tool-like aesthetic — interface recedes, canvas content is the hero.",
  "Layer hierarchy by brightness contrast, not borders: surfaces one step brighter than the backdrop, controls one step brighter than the surface.",
  "Borders only for: outer panel separation (white/10), input focus (mint ring), semantic status boxes.",
  "Mint green #a7ffd4 = system/flow (canvas connections, selected states, ready states).",
  "Purple #E5B2FF = AI & editor (AI buttons, masks, region annotations, generation ops).",
  "One accent color suffices — do not stack a second when one works.",
  "Shadows only between floating layers and canvas (shadow-pop / shadow-menu / shadow-panel ladder), never inside components.",
  "No skeuomorphism, gradients, emboss, inner shadows, or platform-native 3D controls.",
  "Minimal on-screen text; explanations live in tooltips, not persistent paragraphs.",
];

/** Format design guidelines as human- and model-readable text. */
export function formatGuidelines() {
  return [
    "# VOO Brand Design Principles",
    ...VOO_PRINCIPLES.map((p, idx) => `${idx + 1}. ${p}`),
    "",
    "# Anti-AI-Slop Rules",
    ...ANTI_SLOP_RULES.map((r, idx) => `${idx + 1}. ${r}`),
  ].join("\n");
}

export { ANTI_SLOP_RULES };
