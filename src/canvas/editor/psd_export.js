/**
 * PSD export: the editor document → an ag-psd `Psd` object → `writePsd` bytes.
 *
 * The inverse of psd_import.js, at the fidelity the editor can guarantee:
 *  - painted nodes (image / rect / ellipse / path / text / boolean) become
 *    raster layers, rendered per node at its page size with adjustments baked
 *    in and the matte carried as a layer mask;
 *  - group nodes become layer groups;
 *  - adjustment nodes become real PSD adjustment layers (the common family —
 *    brightness/contrast, hue/saturation, exposure, vibrance, posterize,
 *    threshold, invert, levels, photo filter, colour balance, channel mixer,
 *    black & white);
 *  - region nodes are instructions about the picture, never part of it, and
 *    stay out of the export.
 *
 * The composite is 8-bit sRGB by design (see the roadmap decision to skip
 * print / wide-gamut for now), so no colour-space conversion happens here.
 */

import { writePsd } from "ag-psd";
import { NODE_KIND, groupChildren } from "./scene_model.js";
import { nodeAABB } from "./scene_geometry.js";

/** Editor blend mode → ag-psd's string name (inverse of psd_import's map). */
const BLEND_MODE_TO_PSD = {
  "source-over": "normal",
  dissolve: "dissolve",
  darken: "darken",
  multiply: "multiply",
  "color-burn": "color burn",
  "linear-burn": "linear burn",
  lighten: "lighten",
  screen: "screen",
  "color-dodge": "color dodge",
  "linear-dodge": "linear dodge",
  overlay: "overlay",
  "soft-light": "soft light",
  "hard-light": "hard light",
  "vivid-light": "vivid light",
  "linear-light": "linear light",
  "pin-light": "pin light",
  "hard-mix": "hard mix",
  difference: "difference",
  exclusion: "exclusion",
  subtract: "subtract",
  divide: "divide",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

const PSD_BLEND_DEFAULT = "normal";

/** The layer bounds from a node's position and size. */
function boundsOf(node) {
  const hasTransform = Boolean(
    node?.rotation || node?.shear || node?.perspectiveQuad,
  );
  const bounds = hasTransform ? nodeAABB(node) : node;
  return {
    top: Math.round(bounds.y),
    left: Math.round(bounds.x),
    bottom: Math.round(bounds.y + bounds.height),
    right: Math.round(bounds.x + bounds.width),
  };
}

/** A raster layer for one painted node. */
function rasterLayer(node, rendered) {
  const bounds = rendered?.bounds ?? boundsOf(node);
  const layer = {
    name: node.name || node.kind,
    ...bounds,
    opacity: typeof node.opacity === "number" ? node.opacity : 1,
    blendMode: BLEND_MODE_TO_PSD[node.blendMode] ?? PSD_BLEND_DEFAULT,
  };
  if (node.visible === false) layer.hidden = true;
  if (rendered?.imageData) layer.imageData = rendered.imageData;
  if (rendered?.maskData) {
    layer.mask = {
      top: 0,
      left: 0,
      bottom: rendered.maskData.height,
      right: rendered.maskData.width,
      imageData: rendered.maskData,
    };
  }
  return layer;
}

/** Maps one adjustment node to an ag-psd adjustment layer, or null. */
function adjustmentLayer(node) {
  const adj = node.adjustments ?? {};
  const kind = node.adjustmentKind ?? "brightness";
  const name = node.name || "Adjustment";
  const enabled = (key) => Boolean(adj[key]?.enabled);
  const value = (key) => adj[key]?.value ?? 0;

  /** ag-psd wants the adjustment descriptor under `layer.adjustment`. */
  const wrap = (adjustment) => (adjustment ? { name, adjustment } : null);

  switch (kind) {
    case "brightness":
    case "contrast": {
      const adjustment = { type: "brightness/contrast" };
      if (enabled("brightness") && value("brightness") !== 0)
        adjustment.brightness = value("brightness");
      if (enabled("contrast") && value("contrast") !== 0)
        adjustment.contrast = value("contrast");
      return adjustment.brightness || adjustment.contrast
        ? wrap(adjustment)
        : null;
    }
    case "hue":
    case "saturation":
    case "lightness": {
      const hue = enabled("hue") ? value("hue") : 0;
      const saturation = enabled("saturation") ? value("saturation") : 0;
      const lightness = enabled("lightness") ? value("lightness") : 0;
      if (!hue && !saturation && !lightness) return null;
      return wrap({
        type: "hue/saturation",
        master: { hue, saturation, lightness },
      });
    }
    case "exposure": {
      if (!enabled("exposure") || value("exposure") === 0) return null;
      return wrap({ type: "exposure", exposure: value("exposure") });
    }
    case "vibrance": {
      if (!enabled("vibrance") || value("vibrance") === 0) return null;
      return wrap({ type: "vibrance", vibrance: value("vibrance") });
    }
    case "posterize": {
      if (!enabled("posterize") || value("posterize") === 0) return null;
      return wrap({
        type: "posterize",
        levels: Math.round(value("posterize")),
      });
    }
    case "threshold": {
      if (!enabled("threshold")) return null;
      return wrap({ type: "threshold", level: Math.round(value("threshold")) });
    }
    case "invert": {
      return enabled("invert") ? wrap({ type: "invert" }) : null;
    }
    case "levels": {
      const lv = adj.levels;
      if (!lv?.enabled) return null;
      const pct = (v) =>
        Math.max(0, Math.min(255, Math.round((v / 100) * 255)));
      return wrap({
        type: "levels",
        rgb: {
          shadowInput: pct(lv.black ?? 0),
          highlightInput: pct(lv.white ?? 100),
          midtoneInput: lv.gamma ?? 1,
          shadowOutput: pct(lv.outBlack ?? 0),
          highlightOutput: pct(lv.outWhite ?? 100),
        },
      });
    }
    case "photoFilter": {
      const pf = adj.photoFilter;
      if (!pf?.enabled || (pf.density ?? 0) === 0) return null;
      return wrap({
        type: "photo filter",
        color: hexToPsdColor(pf.color ?? "#f5a623"),
        density: pf.density,
        preserveLuminosity: pf.preserveLuminosity !== false,
      });
    }
    case "colorBalance": {
      const cb = adj.colorBalance;
      if (!cb?.enabled) return null;
      const zone = (name) => ({
        cyanRed: cb[name]?.cyanRed ?? 0,
        magentaGreen: cb[name]?.magentaGreen ?? 0,
        yellowBlue: cb[name]?.yellowBlue ?? 0,
      });
      return wrap({
        type: "color balance",
        shadows: zone("shadows"),
        midtones: zone("midtones"),
        highlights: zone("highlights"),
        preserveLuminosity: cb.preserveLuminosity !== false,
      });
    }
    case "blackAndWhite": {
      const bw = adj.blackAndWhite;
      if (!bw?.enabled) return null;
      return wrap({
        type: "black and white",
        reds: bw.reds ?? 40,
        yellows: bw.yellows ?? 60,
        greens: bw.greens ?? 40,
        cyans: bw.cyans ?? 60,
        blues: bw.blues ?? 20,
        magentas: bw.magentas ?? 80,
        useTint: Boolean(bw.useTint),
      });
    }
    case "curves": {
      const curves = adj.curves;
      if (!curves?.enabled) return null;
      // The editor stores 0..1 points; PSD wants 0..255 input/output pairs.
      const channel = (points) =>
        Array.isArray(points) && points.length >= 2
          ? points.map((p) => ({
              input: Math.round((p.x ?? 0) * 255),
              output: Math.round((p.y ?? p.x ?? 0) * 255),
            }))
          : undefined;
      const rgb = channel(curves.luminance);
      const red = channel(curves.r);
      const green = channel(curves.g);
      const blue = channel(curves.b);
      if (!rgb && !red && !green && !blue) return null;
      const adjustment = { type: "curves" };
      if (rgb) adjustment.rgb = rgb;
      if (red) adjustment.red = red;
      if (green) adjustment.green = green;
      if (blue) adjustment.blue = blue;
      return wrap(adjustment);
    }
    case "channelMixer": {
      const cm = adj.channelMixer;
      if (!cm?.enabled) return null;
      const row = (name, fallback) => {
        const r = cm[name] ?? fallback;
        return r
          ? {
              red: r.red ?? 0,
              green: r.green ?? 0,
              blue: r.blue ?? 0,
              constant: r.constant ?? 0,
            }
          : undefined;
      };
      const adjustment = {
        type: "channel mixer",
        monochrome: Boolean(cm.monochrome),
      };
      const red = row("red", { red: 100, green: 0, blue: 0, constant: 0 });
      const green = row("green", { red: 0, green: 100, blue: 0, constant: 0 });
      const blue = row("blue", { red: 0, green: 0, blue: 100, constant: 0 });
      const gray = row("gray", null);
      if (red) adjustment.red = red;
      if (green) adjustment.green = green;
      if (blue) adjustment.blue = blue;
      if (gray) adjustment.gray = gray;
      return wrap(adjustment);
    }
    case "gradientMap": {
      const gm = adj.gradientMap;
      if (!gm?.enabled) return null;
      const stops =
        Array.isArray(gm.stops) && gm.stops.length >= 2
          ? gm.stops.map((stop) => ({
              color: hexToPsdColor(stop.color ?? "#000000"),
              location: stop.location ?? 0,
              midpoint: 50,
            }))
          : undefined;
      if (!stops) return null;
      return wrap({
        type: "gradient map",
        gradientType: "solid",
        reverse: Boolean(gm.reverse),
        colorStops: stops,
      });
    }
    default:
      // Channel mixer, gradient map, curves and friends are not mapped yet —
      // a faithful export beats a wrong one, so they are left out and the
      // picture stays what the visible layers make it.
      return null;
  }
}

/** #rrggbb → ag-psd RGB colour. */
function hexToPsdColor(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!match) return { r: 0, g: 0, b: 0 };
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

/** An opaque, document-sized RGBA buffer filled with one colour. */
function solidColorImageData(color, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Builds the ag-psd `Psd` object for a document.
 *
 * @param {object} deps
 * @param {object} deps.doc the editor document model
 * @param {(node: object) => {imageData?: object, maskData?: object} | null} deps.renderNode
 *   renders one painted node to pixel data (ImageData-like
 *   `{width, height, data}`) plus an optional matte mask; null for nodes that
 *   must not rasterize (adjustment/region).
 * @param {() => {width: number, height: number, data: Uint8ClampedArray} | null} [deps.renderComposite]
 *   renders the whole page the way the PNG export does, for the file's
 *   composite image. Without it the composite degrades to the background
 *   colour alone — viewers that show the flattened image (instead of
 *   recompositing the layers) would display a blank page, so the real export
 *   path always passes it.
 */
export function buildPsd({ doc, renderNode, renderComposite }) {
  const walk = (nodes) =>
    [...nodes]
      .reverse()
      .map((node) => {
        if (node.kind === NODE_KIND.REGION) return null;
        if (node.visible === false && node.kind === NODE_KIND.GROUP)
          return null;
        if (node.kind === NODE_KIND.ADJUSTMENT) return adjustmentLayer(node);
        if (node.kind === NODE_KIND.GROUP) {
          const children = walk(groupChildren(doc, node.id)).filter(Boolean);
          if (children.length === 0) return null;
          return {
            name: node.name || "Group",
            ...boundsOf(node),
            opened: true,
            children,
          };
        }
        const rendered = renderNode(node);
        return rendered ? rasterLayer(node, rendered) : null;
      })
      .filter(Boolean);

  // PSD stores layers topmost-first; the editor paints doc.nodes[0] first
  // (bottom), so the document order is reversed for the file. Grouped
  // children live in doc.nodes too — they belong to their group's walk.
  const children = walk(doc.nodes.filter((node) => !node.parentId));

  let background = null;
  if (doc.backgroundColor && doc.backgroundColor !== "transparent") {
    const color = hexToPsdColor(doc.backgroundColor);
    // A real bottom layer carrying the page colour, so the flattened look the
    // editor showed is reproducible from the layer stack alone.
    background = {
      name: "Background",
      top: 0,
      left: 0,
      bottom: doc.height,
      right: doc.width,
      opacity: 1,
      blendMode: PSD_BLEND_DEFAULT,
      imageData: solidColorImageData(color, doc.width, doc.height),
    };
    children.push(background);
  }

  const psd = { width: doc.width, height: doc.height, children };
  const composite = renderComposite ? renderComposite() : null;
  if (composite?.data && composite.width === doc.width && composite.height === doc.height) {
    psd.imageData = composite;
  } else if (background) {
    // Fallback for callers without a whole-page renderer, or when the
    // rendered page does not match the document bounds (e.g. a crop): at
    // least keep an opaque composite so a flat read is not blank.
    psd.imageData = background.imageData;
  }
  return psd;
}

/** Encodes the built Psd to bytes. */
export function encodePsd(psd) {
  return writePsd(psd);
}
