export const SHOT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    action: { type: "string" },
    framing: { type: "string" },
    imagePrompt: { type: "string" },
    videoPrompt: { type: "string" },
    duration: { type: "number" },
  },
  required: ["title", "action", "framing", "imagePrompt", "videoPrompt"],
  additionalProperties: false,
};
