import { googleWeightSpecOf } from "./google_fonts_index.js";

/**
 * Bundled editor typefaces and their lazy loading.
 *
 * The fonts ship as woff2 under `public/fonts` and are registered in
 * `styles/tailwind.css`. Text metrics are baked into a node's width/height at
 * measure time, so measuring before the font arrives would store fallback
 * metrics forever. The engine asks `ensureFontLoaded` for every text node it
 * measures; once the promise resolves, it re-measures and repaints.
 *
 * Pure data + a thin wrapper over the Font Loading API — no DOM access at
 * import time, so tests can import the registry directly.
 */

/**
 * The bundled families offered by the font picker.
 *
 * `stack` is what lands on a node's `fontFamily`: the bundled family plus a
 * system fallback, so a broken/missing download still renders. Licenses (all
 * OFL) sit next to the woff2 files as `<slug>.OFL.txt`.
 */
export const BUNDLED_FONTS = [
  { slug: "inter", family: "Inter", stack: "'Inter', system-ui, sans-serif" },
  { slug: "roboto", family: "Roboto", stack: "'Roboto', sans-serif" },
  {
    slug: "montserrat",
    family: "Montserrat",
    stack: "'Montserrat', sans-serif",
  },
  { slug: "poppins", family: "Poppins", stack: "'Poppins', sans-serif" },
  { slug: "open-sans", family: "Open Sans", stack: "'Open Sans', sans-serif" },
  { slug: "lato", family: "Lato", stack: "'Lato', sans-serif" },
  { slug: "oswald", family: "Oswald", stack: "'Oswald', sans-serif" },
  { slug: "raleway", family: "Raleway", stack: "'Raleway', sans-serif" },
  {
    slug: "noto-sans-sc",
    family: "Noto Sans SC",
    stack: "'Noto Sans SC', sans-serif",
  },
  {
    slug: "ma-shan-zheng",
    family: "Ma Shan Zheng",
    stack: "'Ma Shan Zheng', cursive",
  },
  {
    slug: "zcool-xiaowei",
    family: "ZCOOL XiaoWei",
    stack: "'ZCOOL XiaoWei', serif",
  },
  {
    slug: "playfair-display",
    family: "Playfair Display",
    stack: "'Playfair Display', Georgia, serif",
  },
  { slug: "bitter", family: "Bitter", stack: "'Bitter', 'Rockwell', serif" },
  {
    slug: "archivo-black",
    family: "Archivo Black",
    stack: "'Archivo Black', 'Arial Black', sans-serif",
  },
  { slug: "caveat", family: "Caveat", stack: "'Caveat', cursive" },
  {
    slug: "zcool-kuaile",
    family: "ZCOOL KuaiLe",
    stack: "'ZCOOL KuaiLe', 'PingFang SC', sans-serif",
  },
  {
    slug: "intel-one-mono",
    family: "Intel One Mono",
    stack: "'Intel One Mono', ui-monospace, monospace",
  },
];

export function bundledFamilyOf(fontStack) {
  if (typeof fontStack !== "string") return null;
  // Match explicit bundled fonts first
  const found = BUNDLED_FONTS.find((font) => fontStack.includes(font.family));
  if (found) return found.family;
  // Or extract the first quoted font family name (e.g. "'Outfit', sans-serif" -> "Outfit")
  const match = fontStack.match(/['"]([^'"]+)['"]/);
  if (
    match &&
    match[1] &&
    !match[1].toLowerCase().includes("system") &&
    !match[1].toLowerCase().includes("sans-serif")
  ) {
    return match[1];
  }
  return null;
}

export const GOOGLE_FONT_WEIGHT_SPECS = {
  Inter: ":wght@100..900",
  Roboto: ":wght@100..900",
  Montserrat: ":wght@100..900",
  Poppins: ":wght@100;200;300;400;500;600;700;800;900",
  "Open Sans": ":wght@300..800",
  Lato: ":wght@100;300;400;700;900",
  Oswald: ":wght@200..700",
  Raleway: ":wght@100..900",
  "Noto Sans SC": ":wght@100..900",
  "Playfair Display": ":wght@400..900",
  Bitter: ":wght@100..900",
  Caveat: ":wght@400..700",
  "Archivo Black": "",
  "Ma Shan Zheng": "",
  "ZCOOL XiaoWei": "",
  "ZCOOL KuaiLe": "",
  "Intel One Mono": "",
};

export function googleFontUrl(family, weightSpec) {
  const spec =
    weightSpec !== undefined
      ? weightSpec
      : (GOOGLE_FONT_WEIGHT_SPECS[family] ?? googleWeightSpecOf(family));
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${spec}&display=swap`;
}

/** family -> Promise<boolean>, so a family is only ever requested once. */
const loadCache = new Map();
let fontResourceVersion = 0;
export const getFontResourceVersion = () => fontResourceVersion;

/**
 * Loads the bundled family a stack references.
 *
 * Returns null when the stack is a system stack or the Font Loading API is
 * unavailable (tests, non-DOM contexts) — the caller treats that as "nothing
 * to wait for". Otherwise returns a promise resolving true once the font can
 * be measured against, false if the load failed.
 */
export function ensureFontLoaded(fontStack) {
  const family = bundledFamilyOf(fontStack);
  if (!family) return null;
  if (typeof document === "undefined" || !document.fonts?.load) return null;
  if (!loadCache.has(family)) {
    const fontId = `gfont-${family.toLowerCase().replace(/\s+/g, "-")}`;
    const initialSpec = GOOGLE_FONT_WEIGHT_SPECS[family] ?? googleWeightSpecOf(family);
    let link = document.getElementById(fontId);
    if (!link) {
      link = document.createElement("link");
      link.id = fontId;
      link.rel = "stylesheet";
      link.href = googleFontUrl(family, initialSpec);
      document.head.appendChild(link);
    }
    const loadFont = () =>
      document.fonts.load(`32px "${family}"`).then(
        (faces) => {
          if (faces.length > 0) fontResourceVersion += 1;
          return faces.length > 0;
        },
        () => false,
      );

    const promise = (async () => {
      const ok = await loadFont();
      if (ok) return true;
      if (initialSpec) {
        if (link) {
          link.href = googleFontUrl(family, "");
        }
        return await loadFont();
      }
      return false;
    })();

    loadCache.set(family, promise);
  }
  return loadCache.get(family);
}

