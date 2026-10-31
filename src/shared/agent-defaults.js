/** Shared defaults for the main agent and Design Editor generation. */
export const DEFAULT_CODEX_MODEL = "gpt-6-astra";
export const DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5";
export const DEFAULT_IMAGE_PLATFORM = "chatgpt";

export const CODEX_MODELS = [
  { id: DEFAULT_CODEX_MODEL, label: "GPT-6 Astra" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
  { id: "gpt-6-luna", label: "GPT-6 Luna" },
];

/** One pinned current model per Claude family for predictable selection. */
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
];

/** Keep every capability tier for the newest version of each known model family. */
export function latestModelVersions(models) {
  const parsed = models.map((model) => ({
    model,
    version: parseModelVersion(model.id),
  }));
  const newestByFamily = new Map();
  for (const { version } of parsed) {
    if (!version) continue;
    const current = newestByFamily.get(version.family);
    if (!current || compareVersion(version.parts, current) > 0) {
      newestByFamily.set(version.family, version.parts);
    }
  }
  return parsed
    .filter(({ version }) => {
      if (!version) return true;
      return compareVersion(version.parts, newestByFamily.get(version.family)) === 0;
    })
    .map(({ model }) => model);
}

function parseModelVersion(id) {
  const modelId = String(id ?? "").replace(
    /^(?:claude|codex|antigravity):/i,
    "",
  );
  const codex = /^gpt-(\d+)(?:\.(\d+))?-(astra|sol|terra|luna)(?:-|$)/i.exec(
    modelId,
  );
  if (codex) {
    return {
      family: `gpt-${codex[3].toLowerCase()}`,
      parts: [Number(codex[1]), Number(codex[2] ?? 0)],
    };
  }
  const claude = /^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)(?:-(?:high|medium|low|thinking))?$/i.exec(
    modelId,
  );
  if (claude) {
    return {
      family: `claude-${claude[1].toLowerCase()}`,
      parts: [Number(claude[2]), Number(claude[3])],
    };
  }
  const legacyClaude = /^claude-(\d+)-(\d+)-(opus|sonnet|haiku|fable)$/i.exec(
    modelId,
  );
  if (legacyClaude) {
    return {
      family: `claude-${legacyClaude[3].toLowerCase()}`,
      parts: [Number(legacyClaude[1]), Number(legacyClaude[2])],
    };
  }
  const gemini = /^gemini-(\d+)\.(\d+)-([a-z0-9-]+?)(?:-(?:high|medium|low))?$/i.exec(
    modelId,
  );
  if (gemini) {
    return {
      family: `gemini-${gemini[3].toLowerCase()}`,
      parts: [Number(gemini[1]), Number(gemini[2])],
    };
  }
  return null;
}

function compareVersion(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
