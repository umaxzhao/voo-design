/**
 * Welcome-screen generation handoff.
 *
 * The welcome composer builds ONE immutable intent object and writes it to the
 * design store. The agent panel claims that object exactly once and turns it
 * into a normal generation turn, so the dashboard no longer has to reason about
 * DOM events, component mount order, or which panel is currently open.
 */
import { fromDesignSystemPreset } from "../../agent/design_system/from-preset.js";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_STYLE_ID, DEFAULT_DESIGN_SYSTEM_ID, MAX_REFERENCE_IMAGES, MAX_REFERENCE_BYTES, designSystemById, styleById } from "./generation-options.js";
export * from "./generation-options.js";

/** Resolved contract + brief for an explicitly selected signature system. */
export function resolveDesignSystemIntent(id, t = (key) => key, locale = "en") {
  const system = designSystemById(id);
  if (!system) return null;
  const name = t(system.labelKey);
  return {
    id: system.id,
    name,
    contract: fromDesignSystemPreset(system, { locale, name }),
  };
}

/**
 * Assembles the final user prompt: the user's own words, the scene guidance of
 * the selected design type, and (when the user picked one) the style kit's
 * tokens. The agent receives the same scene kind + style id structurally too;
 * this text keeps the model oriented even when it runs its own tool loop.
 */
export function buildGenerationPrompt({ preset, prompt, styleId, designSystem, t = (key) => key }) {
  const sections = [String(prompt ?? "").trim()];
  if (preset?.guidance) {
    sections.push(`Creation guide — ${t(preset.label)}:\n${t(preset.guidance)}`);
  }
  if (designSystem?.contract) {
    sections.push(`Design system — ${designSystem.name}:\n${designSystem.contract.designMd}`);
    return sections.filter(Boolean).join("\n\n");
  }
  const style = styleById(styleId);
  if (style) {
    sections.push(
      `Style — ${style.name}: ${style.mood}\n` +
        `Use this one kit: background ${style.palette.bg}, surface ${style.palette.surface}, ` +
        `text ${style.palette.text}, accent ${style.palette.accent}; display font "${style.fonts.display}", ` +
        `body font "${style.fonts.body}"; radius md ${style.radius.md}px; spacing density ${style.spacingDensity}.`,
    );
  }
  return sections.filter(Boolean).join("\n\n");
}

/**
 * Builds the one-shot intent consumed by the agent panel.
 * `preset` is an AI_GEN_TYPES entry; `size` defaults to the preset's frame.
 */
export function buildGenerationIntent({
  preset,
  prompt,
  styleId = DEFAULT_STYLE_ID,
  designSystemId = DEFAULT_DESIGN_SYSTEM_ID,
  modelId = "",
  size = null,
  attachments = [],
  candidates = 1,
  locale = "en",
  t = (key) => key,
  now = () => Date.now(),
} = {}) {
  const activePreset = preset ?? AI_GEN_TYPES[0];
  const width = Math.round(Number(size?.width ?? activePreset.width));
  const height = Math.round(Number(size?.height ?? activePreset.height));
  const style = styleById(styleId);
  const designSystem = resolveDesignSystemIntent(designSystemId, t, locale);
  const references = (attachments ?? []).filter((item) => item?.kind === "image");
  const variantCount = Math.max(1, Math.min(3, Math.round(Number(candidates) || 1)));
  return {
    id: `gen_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    prompt: buildGenerationPrompt({ preset: activePreset, prompt, styleId, designSystem, t }),
    kind: activePreset.id,
    kindLabel: t(activePreset.label),
    frame: { width, height },
    styleId: designSystem ? DEFAULT_STYLE_ID : (style?.id ?? DEFAULT_STYLE_ID),
    styleName: designSystem?.name ?? style?.name ?? "",
    designSystemId: designSystem?.id ?? DEFAULT_DESIGN_SYSTEM_ID,
    designSystemName: designSystem?.name ?? "",
    designSystemContract: designSystem?.contract ?? null,
    modelId,
    attachments: [...(attachments ?? [])],
    referenceCount: references.length,
    candidates: variantCount,
    badge: `${t(activePreset.label)} · ${designSystem?.name ?? style?.name ?? t("welcome.prompt.styleAuto")} · ${width}×${height}${
      variantCount > 1 ? ` · ${variantCount}×` : ""
    }`,
    origin: "welcome",
    createdAt: now(),
  };
}

/** Structural context handed to the agent as the first line of the turn. */
export function generationContextText(intent) {
  if (!intent) return "";
  const parts = [
    "kind=" + intent.kind,
    "frame=" + `${intent.frame?.width ?? 0}x${intent.frame?.height ?? 0}`,
    "style=" + (intent.styleId && intent.styleId !== DEFAULT_STYLE_ID ? intent.styleId : "auto"),
  ];
  if (intent.designSystemId && intent.designSystemId !== DEFAULT_DESIGN_SYSTEM_ID) {
    parts.push("designSystem=" + intent.designSystemId);
  }
  if (intent.modelId) parts.push("model=" + intent.modelId);
  parts.push("references=" + (intent.referenceCount ?? 0));
  if ((intent.candidates ?? 1) > 1) parts.push("candidates=" + intent.candidates);
  return `[Generation] ${parts.join(" ")}`;
}

/** Transcript badge for a generation turn. */
export function generationBadgeText(intent, modelLabel = "") {
  if (!intent) return "";
  return modelLabel ? `${intent.badge} · ${modelLabel}` : intent.badge;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/i;
const DESIGN_FILE = /\.(voo|pen|fig|svg)$/i;

/**
 * Reads composer attachments into intent records. Images carry a data URL so
 * the panel can drop them on the canvas as visual references; design files are
 * recorded by name (the generation turn can then ask the user to import them).
 * Returns `{ attachments, errors }`; never throws for one bad file.
 */
export async function readAttachmentFiles(fileList, { limit = MAX_REFERENCE_IMAGES, maxBytes = MAX_REFERENCE_BYTES } = {}) {
  const files = Array.from(fileList ?? []).slice(0, limit);
  const attachments = [];
  const errors = [];
  for (const file of files) {
    if (!file) continue;
    if (file.size > maxBytes) {
      errors.push(`${file.name}: larger than ${Math.round(maxBytes / (1024 * 1024))}MB`);
      continue;
    }
    const isImage = IMAGE_MIME.test(file.type ?? "") || IMAGE_FILE.test(file.name ?? "");
    if (isImage) {
      try {
        attachments.push({ kind: "image", name: file.name, size: file.size, dataUrl: await readAsDataUrl(file) });
      } catch (error) {
        errors.push(`${file.name}: ${error?.message ?? "failed to read"}`);
      }
      continue;
    }
    if (DESIGN_FILE.test(file.name ?? "")) {
      attachments.push({ kind: "file", name: file.name, size: file.size });
      continue;
    }
    errors.push(`${file.name}: unsupported attachment type`);
  }
  return { attachments, errors };
}

/**
 * Describes attached images without inserting them into the document. Keeping
 * references out of the scene lets the empty-canvas generation pipeline run
 * and avoids mixing source images into the editable result.
 */
export function referenceImageContext(attachments = []) {
  const images = (attachments ?? []).filter((item) => item?.kind === "image" && item.dataUrl);
  if (!images.length) return "";
  return `[Visual reference images attached: ${images.map((item) => item.name).join(", ")}. Use them for composition, palette and hierarchy; rebuild the design as editable layers.]`;
}
