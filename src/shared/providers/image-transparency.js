import { ProviderError } from "./provider_302_error.js";

// Explicitly verified OpenAI API models only; gateway aliases are not proof of
// alpha support. GPT Image 2 transparency is a preview capability as of
// 2026-08-20: https://developers.openai.com/api/docs/changelog
// Model references: https://developers.openai.com/api/docs/guides/image-prompting
const OPENAI_TRANSPARENT_MODELS = new Set([
  "gpt-image-1",
  "gpt-image-1.5",
  "gpt-image-1.5-2025-12-16",
  "gpt-image-2",
  "gpt-image-2-2026-04-21",
]);

/** Model capability only; callers must separately verify the provider route. */
export function supportsOpenAITransparentBackground(model) {
  return (
    typeof model === "string" &&
    OPENAI_TRANSPARENT_MODELS.has(model.trim().toLowerCase())
  );
}

/** Reject alpha loss before an edit can fetch references or submit a paid job. */
export function validateImageTransparencyOutput(request) {
  const background = request.background?.trim?.().toLowerCase();
  const outputFormat = request.output_format?.trim?.().toLowerCase();
  if (
    background === "transparent" &&
    (outputFormat === "jpeg" || outputFormat === "jpg")
  ) {
    throw new ProviderError("providerTransparentFormatRequired");
  }
}
