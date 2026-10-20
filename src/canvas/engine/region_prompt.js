/**
 * Turns reference regions into prompt text.
 *
 * A region is a box the user drew on the picture. It never reaches the model
 * as pixels — only as this instruction block, which is why the wording matters
 * as much as the numbers.
 *
 * Coordinates are percentages of the whole image so the instruction survives
 * whatever resolution the model renders at, and every box also carries a
 * plain-language anchor: models follow "top-left area" far more reliably than
 * they follow a pair of numbers, and the numbers then refine it.
 *
 * Labels are English, like every other compiled block, because they travel to
 * the model rather than to the UI.
 */

import {
  regionParts,
  normalizeRegionIntent,
  getRegionColor,
} from "../editor/scene_doc_factory.js";
import { regionOutlineInDoc } from "../editor/doc_ops_regions.js";

/** A box this large is the whole picture, and no anchor word would be honest. */
const FULL_FRAME_RATIO = 0.85;

const COLUMNS = ["left", "center", "right"];
const ROWS = ["top", "middle", "bottom"];

function thirdOf(value) {
  if (value < 1 / 3) return 0;
  if (value < 2 / 3) return 1;
  return 2;
}

/**
 * A nine-square anchor for the box's centre.
 *
 * The middle square is just "center"; the rest read as "top-left",
 * "middle-right" and so on.
 */
export function anchorOf(region) {
  if (region.width >= FULL_FRAME_RATIO && region.height >= FULL_FRAME_RATIO) {
    return "full frame";
  }
  const column = COLUMNS[thirdOf(region.x + region.width / 2)];
  const row = ROWS[thirdOf(region.y + region.height / 2)];
  if (row === "middle" && column === "center") return "center";
  return `${row}-${column}`;
}

const percent = (value) => `${Math.round(value * 100)}%`;

/**
 * A description line that begins with "- " is a constraint, not a
 * description: something to keep out rather than put in.
 *
 * A prefix rather than a keyword, because the field takes 中文 as readily as
 * English and no keyword works in both.
 */
const CONSTRAINT_PREFIX = "- ";

function splitDetail(detail) {
  const wants = [];
  const avoids = [];
  for (const line of detail) {
    if (line.startsWith(CONSTRAINT_PREFIX)) {
      avoids.push(line.slice(CONSTRAINT_PREFIX.length).trim());
    } else {
      wants.push(line);
    }
  }
  return { wants, avoids: avoids.filter(Boolean) };
}

/**
 * One region as its own entry in a section.
 *
 * The first line of a label names the thing and goes on the bullet with its
 * box. Anything written under it is what the box should actually contain —
 * the part that makes a generated image right rather than merely
 * well-arranged — and it is indented beneath the bullet so a description that
 * runs to several lines stays visibly attached to its own region instead of
 * reading as more regions.
 */
function describeRegion(region, intent, index = 0) {
  const box = [
    `x ${percent(region.x)}`,
    `y ${percent(region.y)}`,
    `width ${percent(region.width)}`,
    `height ${percent(region.height)}`,
  ].join(", ");
  const { name, detail } = regionParts(region.label);
  const { wants, avoids } = splitDetail(detail);
  const colorInfo = region.color
    ? { hex: region.color, name: region.colorName || region.color }
    : getRegionColor(index);

  const lines = [
    `- [${colorInfo.name} / ${colorInfo.hex}] ${name || "Region"}: ${box} — ${anchorOf(region)}`,
  ];
  for (const line of wants) lines.push(`    ${line}`);
  if (avoids.length > 0) lines.push(`    Avoid: ${avoids.join("; ")}`);
  // Sampled from the picture under the box, so the model can match what is
  // already there without anyone having to name the colours by hand. A box
  // being kept clear has nothing put in it, so what is under it describes
  // nothing — and a stored payload can carry colours sampled before the
  // intent was changed, which is why this is checked here and not only where
  // the sampling happens.
  if (intent !== "clear" && region.colours?.length) {
    lines.push(`    Colours already there: ${region.colours.join(", ")}`);
  }
  return lines.join("\n");
}

/** Each intent becomes its own section, in the order the model should read them. */
const SECTIONS = [
  {
    intent: "place",
    heading:
      "Layout reference (percentages of the full image, origin at the top-left corner):",
    footer:
      "Place each element inside the box given for it, and follow the lines" +
      " indented under a region as the description of what belongs there.",
  },
  {
    intent: "keep",
    heading: "Leave these areas of the source image unchanged:",
    footer:
      "Reproduce what is already inside these boxes; do not restyle them.",
  },
  {
    intent: "clear",
    heading: "Keep these areas clear:",
    footer: "Nothing described above may extend into these boxes.",
  },
];

/**
 * How the boxes sit relative to each other, as sentences.
 *
 * Percentages say where each box is but never say what the layout *means*,
 * and a model given "the headline is directly above the body, and they share
 * a left edge" holds an arrangement together far better than one given four
 * numbers twice. Derived rather than authored: nobody should have to write
 * down a relationship the geometry already states.
 */
const EDGE_TOLERANCE = 0.02;
const GAP_TOLERANCE = 0.25;

function relationsBetween(regions) {
  const sentences = [];
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const a = regions[i];
      const b = regions[j];
      const nameA = regionParts(a.label).name;
      const nameB = regionParts(b.label).name;

      const sharesLeft = Math.abs(a.x - b.x) <= EDGE_TOLERANCE;
      const sharesRight =
        Math.abs(a.x + a.width - (b.x + b.width)) <= EDGE_TOLERANCE;
      const sharesCentreX =
        Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) <= EDGE_TOLERANCE;

      // Stacked: one ends above the other begins, and they overlap across.
      const gap = b.y - (a.y + a.height);
      const overlapsAcross =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0;
      if (gap >= 0 && gap <= GAP_TOLERANCE && overlapsAcross) {
        sentences.push(`${nameB} sits directly below ${nameA}.`);
      }

      if (sharesCentreX) {
        sentences.push(`${nameA} and ${nameB} share a vertical centre line.`);
      } else if (sharesLeft) {
        sentences.push(`${nameA} and ${nameB} share a left edge.`);
      } else if (sharesRight) {
        sentences.push(`${nameA} and ${nameB} share a right edge.`);
      }
    }
  }
  return sentences;
}

/**
 * The region's box in document coordinates, for the anchor and percentage
 * maths below.
 *
 * A region lives in its host image's pixels, so when the editor document is
 * available the box is mapped through the host image's transform — a picture
 * moved or resized moves its annotations with it, and the instruction follows
 * to wherever the box actually is on the page. Without a document (legacy
 * regions stored before regions attached to pictures) the stored box is used
 * as-is.
 */
function regionBoxInDoc(region, doc) {
  if (doc && Array.isArray(doc.nodes)) {
    const outline = regionOutlineInDoc(doc, region);
    if (outline) return outline.box;
  }
  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };
}

function usableRegions(regions, doc) {
  return (regions ?? [])
    .filter(
      (region) =>
        region &&
        typeof region.label === "string" &&
        regionParts(region.label).name &&
        Number.isFinite(region.x) &&
        Number.isFinite(region.y) &&
        Number.isFinite(region.width) &&
        Number.isFinite(region.height),
    )
    .map((region) => ({ ...region, ...regionBoxInDoc(region, doc) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Compiles a node's stored regions into instruction blocks, or an empty
 * string when there is nothing to say.
 *
 * Unlabelled regions are skipped: a box with no name carries no instruction.
 * The rest are grouped by what they ask for and listed in reading order, top
 * to bottom then left to right, so the same layout always compiles to the
 * same text.
 *
 * `doc`, when given, is the editor document the regions came from — it is
 * what maps their host-image-local boxes back to page coordinates.
 */
export function compileRegions(regions, doc) {
  const usable = usableRegions(regions, doc);
  if (usable.length === 0) return "";

  const blocks = [];
  for (const section of SECTIONS) {
    const mine = usable.filter(
      (region) => normalizeRegionIntent(region.intent) === section.intent,
    );
    if (mine.length === 0) continue;
    blocks.push(
      [
        section.heading,
        ...mine.map((region, idx) =>
          describeRegion(region, section.intent, idx),
        ),
        section.footer,
      ].join("\n"),
    );
  }

  // Relationships are only meaningful between boxes that are being placed;
  // an area to leave alone has no arrangement with anything.
  const placed = usable.filter(
    (region) => normalizeRegionIntent(region.intent) === "place",
  );
  const relations = relationsBetween(placed);
  if (relations.length > 0) {
    blocks.push(
      ["How they relate:", ...relations.map((line) => `- ${line}`)].join("\n"),
    );
  }

  return blocks.join("\n\n");
}

/**
 * Compiles the descriptions layers carry about themselves.
 *
 * Separate from the region blocks because it answers a different question.
 * A region is an instruction — put this here, leave that clear. A layer's
 * prompt is reference: this is what you are looking at. The generator reads
 * both, and confusing the two would have it treat a description of the
 * existing picture as a demand to change it.
 *
 * Anchors come from the same helper the regions use, so "upper left" means
 * the same thing in both halves of the prompt.
 */
export function compileLayerPrompts(layers) {
  const usable = (layers ?? []).filter(
    (layer) =>
      layer &&
      typeof layer.prompt === "string" &&
      layer.prompt.trim().length > 0 &&
      Number.isFinite(layer.x) &&
      Number.isFinite(layer.y),
  );
  if (usable.length === 0) return "";

  const lines = usable.map((layer) => {
    const where = anchorOf(layer);
    return `- ${layer.prompt.trim()} (${where})`;
  });
  return [
    "What is already in the picture, for reference:",
    ...lines,
    "Use these as context; they describe the artwork, they are not requests.",
  ].join("\n");
}

/**
 * The whole instruction a document contributes: regions, then layer notes.
 *
 * One entry point so callers cannot accidentally send half of it, and so the
 * order stays fixed — instructions first, reference after, which is the order
 * they matter in.
 */
export function compileDocumentPrompt({ regions, layers, doc } = {}) {
  return [compileRegions(regions, doc), compileLayerPrompts(layers)]
    .filter((block) => block.length > 0)
    .join("\n\n");
}
