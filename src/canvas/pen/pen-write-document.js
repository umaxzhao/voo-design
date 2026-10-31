import { NODE_KIND } from "../editor/scene_doc_factory.js";
import { normalizeRotationDeg } from "../editor/scene_model_core.js";
import { PEN_WRITE_VERSION, WRITABLE_KINDS, MAX_DEPTH } from "./pen-write-contract.js";
import { round, penBlendMode, penCornerRadius, penEffects, penGraphics } from "./pen-write-paint.js";

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/**
 * The node's unrotated top-left in page coordinates. VOO rotates a box around
 * its centre, Pen around its top-left, so a rotated node is shifted back to the
 * box Pen would rotate into the same place.
 */
function placedBase(node) {
  const x = Number(node.x ?? 0);
  const y = Number(node.y ?? 0);
  const rotation = normalizeRotationDeg(node.rotation ?? 0);
  if (!rotation) return { x, y };
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = Number(node.width ?? 0) / 2;
  const cy = Number(node.height ?? 0) / 2;
  return {
    x: x + cx - cos * cx + sin * cy,
    y: y + cy - sin * cx - cos * cy,
  };
}

/** Pen rotation for a VOO rotation (opposite sign: Pen counts counter-clockwise). */
function penRotation(rotation) {
  const value = normalizeRotationDeg(-rotation);
  return value ? round(value) : 0;
}

/**
 * SVG path data for a pen node in its own box coordinates. The editor stores
 * anchors relative to the box origin; `baseWidth`/`baseHeight` keep a resized
 * path's original proportions.
 */
export function localPathGeometry(node) {
  const points = Array.isArray(node.points) ? node.points : [];
  if (points.length === 0) return "";
  const scaleX = node.baseWidth ? Number(node.width ?? 0) / node.baseWidth : 1;
  const scaleY = node.baseHeight ? Number(node.height ?? 0) / node.baseHeight : 1;
  const at = (point, handle = null) => {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    return `${round((x + (handle?.[0] ?? 0)) * scaleX)} ${round((y + (handle?.[1] ?? 0)) * scaleY)}`;
  };

  const commands = [];
  let contourStart = 0;
  while (contourStart < points.length) {
    const first = points[contourStart];
    commands.push(`M${at(first)}`);
    if (first.close) {
      commands.push("Z");
      contourStart += 1;
      continue;
    }
    let index = contourStart + 1;
    while (index < points.length) {
      const from = points[index - 1];
      const to = points[index];
      commands.push(
        from.out || to.in
          ? `C${at(from, from.out)} ${at(to, to.in)} ${at(to)}`
          : `L${at(to)}`,
      );
      if (to.close) {
        commands.push(
          to.out || first.in
            ? `C${at(to, to.out)} ${at(first, first.in)} ${at(first)}`
            : "",
        );
        commands.push("Z");
        index += 1;
        break;
      }
      index += 1;
    }
    contourStart = index;
  }
  return commands.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Document
 * ------------------------------------------------------------------ */

/** A stable Pen id: no `/` (the schema forbids it) and unique per document. */
function penId(node, ctx) {
  const raw = typeof node.id === "string" && node.id.trim() ? node.id.trim() : null;
  const candidate = (raw ?? `voo-${ctx.counter + 1}`).replaceAll("/", "-");
  let id = candidate;
  while (ctx.ids.has(id)) {
    ctx.counter += 1;
    id = `${candidate}-${ctx.counter}`;
  }
  ctx.ids.add(id);
  return id;
}

function writeNode(node, parentBase, ctx, depth) {
  if (!node || depth > MAX_DEPTH) return null;
  if (!WRITABLE_KINDS.has(node.kind)) return null;

  const base = placedBase(node);
  const origin = parentBase ?? { x: 0, y: 0 };
  const width = Math.max(0, Number(node.width ?? 0));
  const height = Math.max(0, Number(node.height ?? 0));
  const rotation = normalizeRotationDeg(node.rotation ?? 0);
  const common = {
    id: penId(node, ctx),
    ...(typeof node.name === "string" && node.name ? { name: node.name } : {}),
    x: round(base.x - origin.x),
    y: round(base.y - origin.y),
  };

  const out = { type: null, ...common };

  if (node.kind === NODE_KIND.GROUP) {
    // In VOO, groups may have explicit dimensions and autoLayout, or isFrame flag.
    // If it has width/height or is explicitly marked as frame, emit a Pen frame.
    const isFrame = Boolean(node.isFrame) || (width > 0 && height > 0) || Boolean(node.autoLayout);
    out.type = isFrame ? "frame" : "group";
    if (isFrame) {
      out.width = round(width);
      out.height = round(height);
      // VOO stores resolved child boxes; Pen must not re-flow them.
      out.layout = "none";
      const radius = penCornerRadius(node);
      if (radius !== undefined) out.cornerRadius = radius;
      if (node.clipTo) out.clip = true;
      Object.assign(out, penGraphics(node, ctx));
    } else {
      const effects = penEffects(node);
      if (effects) out.effect = effects;
    }
  } else if (node.kind === NODE_KIND.RECT || node.kind === NODE_KIND.IMAGE) {
    out.type = "rectangle";
    out.width = round(width);
    out.height = round(height);
    const radius = penCornerRadius(node);
    if (radius !== undefined) out.cornerRadius = radius;
    Object.assign(
      out,
      penGraphics(node, ctx, {
        imageId: node.kind === NODE_KIND.IMAGE ? node.imageId : null,
      }),
    );
  } else if (node.kind === NODE_KIND.ELLIPSE) {
    out.type = "ellipse";
    out.width = round(width);
    out.height = round(height);
    Object.assign(out, penGraphics(node, ctx));
  } else if (node.kind === NODE_KIND.PATH) {
    const geometry = localPathGeometry(node);
    if (!geometry) return null;
    out.type = "path";
    out.width = round(width);
    out.height = round(height);
    out.geometry = geometry;
    out.viewBox = [0, 0, round(Math.max(1, width)), round(Math.max(1, height))];
    if (node.fillRule === "evenodd") out.fillRule = "evenodd";
    Object.assign(out, penGraphics(node, ctx));
  } else if (node.kind === NODE_KIND.TEXT) {
    out.type = "text";
    out.content = String(node.text ?? "");
    out.width = round(Math.max(1, Number(node.boxWidth) > 0 ? node.boxWidth : width));
    out.height = round(Math.max(1, height));
    out.textGrowth = Number(node.boxWidth) > 0 ? "fixed-width" : "auto";
    if (node.fontFamily) out.fontFamily = String(node.fontFamily);
    if (Number(node.fontSize) > 0) out.fontSize = round(node.fontSize);
    if (node.fontWeight) out.fontWeight = String(node.fontWeight);
    if (node.italic) out.fontStyle = "italic";
    if (node.underline) out.underline = true;
    if (Number.isFinite(Number(node.lineHeight)) && Number(node.lineHeight) > 0) {
      out.lineHeight = round(node.lineHeight);
    }
    if (Number.isFinite(Number(node.letterSpacing))) {
      out.letterSpacing = round(node.letterSpacing);
    }
    if (node.align) out.textAlign = String(node.align);
    Object.assign(out, penGraphics(node, ctx));
  } else {
    return null;
  }

  if (rotation) out.rotation = penRotation(rotation);
  if (node.visible === false) out.enabled = false;
  if (Number(node.opacity) < 1) out.opacity = round(Math.max(0, node.opacity));
  const blend = penBlendMode(node.blendMode);
  if (blend) out.blendMode = blend;

  if (node.kind === NODE_KIND.GROUP) {
    const children = [];
    for (const child of ctx.childrenOf(node.id)) {
      const written = writeNode(child, base, ctx, depth + 1);
      if (written) children.push(written);
    }
    if (children.length > 0) out.children = children;
  }
  return out;
}

/**
 * Builds the Pen document for one VOO scene document.
 *
 * `imageUrl(id)` resolves an image asset to a URL Pen can read (the save path
 * inlines data URLs, which keeps the file self-contained).
 */
export function buildPenDocument(sceneDoc, { imageUrl = null } = {}) {
  const nodes = Array.isArray(sceneDoc?.nodes) ? sceneDoc.nodes : [];
  const ids = new Set(nodes.map((node) => node.id).filter(Boolean));
  const byParent = new Map();
  for (const node of nodes) {
    if (!node) continue;
    const parentId =
      typeof node.parentId === "string" && ids.has(node.parentId) ? node.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(node);
    byParent.set(parentId, siblings);
  }

  const ctx = {
    imageUrl,
    counter: 0,
    ids: new Set(),
    childrenOf: (id) => byParent.get(id) ?? [],
  };

  const children = [];
  for (const node of byParent.get(null) ?? []) {
    const written = writeNode(node, null, ctx, 0);
    if (written) children.push(written);
  }

  return { version: PEN_WRITE_VERSION, children };
}

/** Encodes the Pen document as UTF-8 JSON bytes. */
export function serializePenDocument(sceneDoc, options = {}) {
  return new TextEncoder().encode(
    JSON.stringify(buildPenDocument(sceneDoc, options), null, 2),
  );
}

