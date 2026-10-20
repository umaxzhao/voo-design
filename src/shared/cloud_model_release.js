/** Official release dates for existing catalog entries without stored metadata. */
export const VERIFIED_CLOUD_MODEL_RELEASES = Object.freeze({
  "deepseek-flash": {
    date: "2026-09-10",
    source: "https://www.deepseek.com/en/news/deepseek-v4-1-flash/",
  },
  "deepseek-v4-flash": {
    date: "2026-04-24",
    source:
      "https://fe-static.deepseek.com/chat/transparency/deepseek-V4-model-card-EN.pdf",
  },
  "deepseek-v4-pro": {
    date: "2026-04-24",
    source:
      "https://fe-static.deepseek.com/chat/transparency/deepseek-V4-model-card-EN.pdf",
  },
  "gpt-image-1.5": {
    date: "2025-12-16",
    source: "https://openai.com/index/new-chatgpt-images-is-here/",
  },
  "qwen-image-3.0-pro": {
    date: "2026-08-06",
    source:
      "https://www.alibabacloud.com/help/en/model-studio/newly-released-models",
  },
  "wan3.0-video": {
    date: "2026-08-06",
    source:
      "https://www.alibabacloud.com/help/en/model-studio/newly-released-models",
  },
});

export function normalizeCloudReleaseDate(value) {
  if (value instanceof Date && Number.isNaN(value.getTime())) return null;
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

/** A calendar year is used so the cutoff stays correct around leap days. */
export function isRecentCloudReleaseDate(value, now = new Date()) {
  const date = normalizeCloudReleaseDate(value);
  if (!date || Number.isNaN(now.getTime())) return false;
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return date >= cutoff.toISOString().slice(0, 10) && date <= today;
}

export function cloudModelReleaseDate(model) {
  if (!model || typeof model !== "object") return null;
  return (
    normalizeCloudReleaseDate(model.releaseDate) ||
    VERIFIED_CLOUD_MODEL_RELEASES[model.id]?.date ||
    null
  );
}
