/**
 * Asking a vision model where an object is.
 *
 * The agent loop itself stays text-only and cheap: this is a single side
 * request that turns "the dog on the left" into a box, and only the box comes
 * back into the conversation. The picture never enters the message history —
 * a layer's data URL would fill the context window on its own.
 *
 * The request shape is the OpenAI-compatible multimodal one (a `content`
 * array of text and image_url blocks), which DeepSeek's vision model and the
 * other providers on that shape all accept.
 */

import { streamChatCompletion } from "./deepseekApi.js";

/**
 * Coordinates come back normalised (0..1) so the answer is independent of the
 * scale the picture was sent at — the caller downscales freely.
 */
const LOCATE_INSTRUCTION = [
  "You locate objects in pictures for an image editor.",
  "Answer with JSON only, no prose and no code fence:",
  '{"found": true, "label": "<what you found>", "box": {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0}}',
  "The box is the object's bounding box in NORMALISED coordinates: x and y are",
  "the top-left corner as a fraction of the image width and height, width and",
  "height are fractions too. Include the whole object and a small margin.",
  'If the picture does not contain it, answer {"found": false, "label": ""}.',
].join(" ");

/** Builds the multimodal message pair for one localisation request. */
export function buildLocateMessages({ description, dataUrl }) {
  return [
    { role: "system", content: LOCATE_INSTRUCTION },
    {
      role: "user",
      content: [
        { type: "text", text: `Locate: ${description}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];
}

/** Pulls the first JSON object out of an answer, fences and prose included. */
function extractJson(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value)));

/**
 * Normalises whichever box shape the model produced.
 *
 * Vision models are trained on both conventions — `{x, y, width, height}` and
 * a `[x0, y0, x1, y1]` corner array — and which one comes back varies by
 * model and by prompt. Accepting both costs four lines and removes a whole
 * class of "the selection landed in the wrong corner" bugs.
 */
function normaliseBox(box) {
  if (Array.isArray(box) && box.length === 4) {
    const [x0, y0, x1, y1] = box.map(Number);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
    return {
      x: clamp01(Math.min(x0, x1)),
      y: clamp01(Math.min(y0, y1)),
      width: clamp01(Math.abs(x1 - x0)),
      height: clamp01(Math.abs(y1 - y0)),
    };
  }
  if (!box || typeof box !== "object") return null;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
  };
}

/**
 * Parses the model's answer into `{ found, label, box }` with a normalised
 * box, or `{ found: false }` when it reported nothing or answered garbage.
 */
export function parseLocateAnswer(text) {
  const parsed = extractJson(text);
  if (!parsed) return { found: false, label: "", box: null };
  const box = normaliseBox(parsed.box);
  const found =
    parsed.found !== false && Boolean(box) && box.width > 0 && box.height > 0;
  return {
    found,
    label: typeof parsed.label === "string" ? parsed.label : "",
    box: found ? box : null,
  };
}

/**
 * Maps a normalised box onto the layer's document-space rectangle, clipped to
 * the layer so a slightly over-reaching box cannot select outside the picture.
 */
export function toDocumentBox(box, rect) {
  const width = Math.max(1, box.width * rect.width);
  const height = Math.max(1, box.height * rect.height);
  const x = rect.x + box.x * rect.width;
  const y = rect.y + box.y * rect.height;
  const left = Math.max(rect.x, Math.min(x, rect.x + rect.width - 1));
  const top = Math.max(rect.y, Math.min(y, rect.y + rect.height - 1));
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(Math.min(width, rect.x + rect.width - left)),
    height: Math.round(Math.min(height, rect.y + rect.height - top)),
  };
}

/**
 * Asks the vision model an open question about a picture and returns its
 * answer as prose.
 *
 * The counterpart to `locateObjectInImage`: that one wants coordinates, this
 * one wants judgement — "is the subject still centred", "does the patched
 * area read as clean". The answer goes into the conversation as text, so the
 * caller keeps a text-only main loop.
 */
export async function describeImage({
  question,
  dataUrl,
  apiKey,
  model,
  baseUrl,
  signal,
}) {
  const messages = [
    {
      role: "system",
      content:
        "You are the eyes of an image editor's agent. Answer in at most four sentences, concretely and without hedging: name what you actually see, and if the user asked whether something worked, say plainly whether it did and what is wrong if it did not.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: question },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];
  let answer = "";
  for await (const chunk of streamChatCompletion({
    messages,
    model,
    apiKey,
    baseUrl,
    signal,
  })) {
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) answer += delta;
  }
  return answer.trim();
}

/**
 * Runs one localisation request and returns the parsed answer.
 *
 * @param {{description: string, dataUrl: string, apiKey: string,
 *          model: string, baseUrl?: string, signal?: AbortSignal}} params
 */
export async function locateObjectInImage({
  description,
  dataUrl,
  apiKey,
  model,
  baseUrl,
  signal,
}) {
  let answer = "";
  for await (const chunk of streamChatCompletion({
    messages: buildLocateMessages({ description, dataUrl }),
    model,
    apiKey,
    baseUrl,
    signal,
  })) {
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) answer += delta;
  }
  return parseLocateAnswer(answer);
}
