import { describe, expect, it } from "vitest";

import { STYLE_KITS, pickStyleKit } from "../../src/canvas/agent/design_quality/style_kits.js";
import { contrastRatio } from "../../src/canvas/agent/design_quality/tokens.js";

const KIT_IDS = [
  "linear",
  "glass",
  "editorial",
  "enterprise-admin",
  "dribbble-saas",
  "editorial-serif",
  "swiss-grid",
  "brutalist-type",
  "cinematic-dark",
  "bento-showcase",
  "monochrome-print",
  "warm-artisan",
  "blueprint-technical",
  "neon-console",
  "soft-clay",
  "luxury-serif",
  "technical-mono",
  "aurora-gradient",
  "magazine-stack",
  "playful-color",
];
const LEGACY_IDS = ["linear", "glass", "editorial", "enterprise-admin", "dribbble-saas"];
const NEW_IDS = KIT_IDS.filter((id) => !LEGACY_IDS.includes(id));
const PALETTE_KEYS = [
  "accent",
  "accentText",
  "bg",
  "border",
  "danger",
  "success",
  "surface",
  "surfaceAlt",
  "text",
  "textMuted",
  "warning",
].sort();
// Existing kits predate the density enum and keep their shipped values; new
// kits are restricted to the documented three.
const NEW_DENSITIES = ["dense", "comfortable", "roomy"];
const LEGACY_DENSITIES = [...NEW_DENSITIES, "structured", "showcase"];
const REQUIRED_COLOR_KEYS = ["bg", "text", "textMuted", "accent", "accentText"];

function channels(color) {
  const raw = String(color ?? "").trim();
  if (raw.startsWith("#")) {
    const hex = raw.slice(1).replace(/[^0-9a-fA-F]/g, "");
    const body = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex.slice(0, 6);
    return [parseInt(body.slice(0, 2), 16), parseInt(body.slice(2, 4), 16), parseInt(body.slice(4, 6), 16), 1];
  }
  const nums = (raw.match(/[\d.]+/g) ?? []).map(Number);
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}

/** Composites a possibly translucent color over an opaque backdrop. */
function flatten(color, backdrop) {
  const [r, g, b, a] = channels(color);
  const [br, bg, bb] = channels(backdrop);
  const mix = (fg, bgc) => Math.round(fg * a + bgc * (1 - a));
  return `#${[mix(r, br), mix(g, bg), mix(b, bb)]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The surface text actually renders on: opaque kits use bg, glass fills it in. */
function textSurface(kit) {
  return flatten(kit.palette.surface, kit.palette.bg);
}

describe("style kit catalog", () => {
  it("ships 20 kits with unique ids in a stable order", () => {
    const ids = Object.keys(STYLE_KITS);
    expect(ids).toHaveLength(20);
    expect(ids).toEqual(KIT_IDS);
    expect(new Set(ids).size).toBe(20);
    expect(ids[0]).toBe("linear");
    for (const id of LEGACY_IDS) expect(STYLE_KITS[id]).toBeTruthy();
    for (const id of NEW_IDS) expect(STYLE_KITS[id]).toBeTruthy();
    for (const [key, kit] of Object.entries(STYLE_KITS)) expect(kit.id).toBe(key);
  });

  it("gives every kit the complete token contract", () => {
    for (const id of KIT_IDS) {
      const kit = STYLE_KITS[id];
      expect(typeof kit.name, `${id}.name`).toBe("string");
      expect(kit.name.length).toBeGreaterThan(2);
      expect(typeof kit.mood, `${id}.mood`).toBe("string");
      expect(kit.mood.length).toBeGreaterThan(40);

      expect(Object.keys(kit.fonts).sort(), `${id}.fonts`).toEqual(["body", "display", "mono"]);
      for (const role of ["display", "body", "mono"]) {
        expect(typeof kit.fonts[role], `${id}.fonts.${role}`).toBe("string");
        expect(kit.fonts[role].trim().length).toBeGreaterThan(1);
      }

      expect(Array.isArray(kit.typeScale), `${id}.typeScale`).toBe(true);
      expect(kit.typeScale.length).toBeGreaterThanOrEqual(5);
      expect(kit.typeScale.length).toBeLessThanOrEqual(8);

      expect(kit.radius && typeof kit.radius, `${id}.radius`).toBe("object");
      for (const r of ["sm", "md", "lg", "full"]) {
        expect(Number.isFinite(kit.radius[r]), `${id}.radius.${r}`).toBe(true);
        expect(kit.radius[r]).toBeGreaterThanOrEqual(0);
        expect(kit.radius[r]).toBeLessThanOrEqual(9999);
      }

      for (const size of ["sm", "md", "lg"]) {
        const shadow = kit.shadow?.[size];
        expect(shadow && typeof shadow, `${id}.shadow.${size}`).toBe("object");
        expect(typeof shadow.css, `${id}.shadow.${size}.css`).toBe("string");
        expect(shadow.css.length).toBeGreaterThan(0);
        for (const n of ["x", "y", "blur", "spread"]) {
          expect(Number.isFinite(shadow[n]), `${id}.shadow.${size}.${n}`).toBe(true);
        }
        expect(typeof shadow.color, `${id}.shadow.${size}.color`).toBe("string");
      }

      const densities = LEGACY_IDS.includes(id) ? LEGACY_DENSITIES : NEW_DENSITIES;
      expect(densities, `${id}.spacingDensity`).toContain(kit.spacingDensity);

      for (const field of ["layoutPatterns", "dos", "donts"]) {
        expect(Array.isArray(kit[field]), `${id}.${field}`).toBe(true);
        expect(kit[field].length, `${id}.${field}.length`).toBeGreaterThanOrEqual(4);
        expect(kit[field].length, `${id}.${field}.length`).toBeLessThanOrEqual(6);
        for (const line of kit[field]) {
          expect(typeof line, `${id}.${field} entry`).toBe("string");
          expect(line.trim().length, `${id}.${field} entry`).toBeGreaterThan(10);
        }
      }
    }
  });

  it("exposes a complete, readable palette on every kit", () => {
    for (const id of KIT_IDS) {
      const kit = STYLE_KITS[id];
      expect(Object.keys(kit.palette).sort(), `${id}.palette keys`).toEqual(PALETTE_KEYS);
      for (const key of PALETTE_KEYS) {
        expect(typeof kit.palette[key], `${id}.palette.${key}`).toBe("string");
        expect(kit.palette[key].trim().length, `${id}.palette.${key}`).toBeGreaterThan(2);
      }
      // bg/text/accent carry the design identity, so they must be opaque hex.
      for (const key of ["bg", "text", "accent", "accentText"]) {
        expect(kit.palette[key], `${id}.palette.${key}`).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
      }
    }
  });

  it("keeps every type scale ascending and grid sized", () => {
    for (const id of KIT_IDS) {
      const scale = STYLE_KITS[id].typeScale;
      for (const size of scale) {
        expect(Number.isInteger(size), `${id}.typeScale ${size}`).toBe(true);
        expect(size).toBeGreaterThanOrEqual(8);
        expect(size).toBeLessThanOrEqual(200);
      }
      for (let i = 1; i < scale.length; i += 1) {
        expect(scale[i], `${id}.typeScale[${i}]`).toBeGreaterThan(scale[i - 1]);
      }
      const { radius } = STYLE_KITS[id];
      expect(radius.sm).toBeLessThanOrEqual(radius.md);
      expect(radius.md).toBeLessThanOrEqual(radius.lg);
      expect(radius.lg).toBeLessThanOrEqual(radius.full);
    }
  });
});

describe("style kit contrast", () => {
  it("keeps body and muted text readable on every kit's text surface", () => {
    for (const id of KIT_IDS) {
      const kit = STYLE_KITS[id];
      const surface = textSurface(kit);
      expect(contrastRatio(kit.palette.text, surface), `${id} text/surface`).toBeGreaterThanOrEqual(4.5);
      // Muted metadata is not body copy; WCAG large-text 3:1 is the floor.
      expect(contrastRatio(kit.palette.textMuted, surface), `${id} textMuted/surface`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(kit.palette.accentText, kit.palette.accent), `${id} accentText/accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the 15 new kits AA-readable directly against their bg", () => {
    // Existing "glass" is dark ink over a translucent light sheet on a photo,
    // so its `bg` is a backdrop, not a text surface; it is covered by the
    // composited-surface assertion above instead.
    for (const id of NEW_IDS) {
      const palette = STYLE_KITS[id].palette;
      expect(contrastRatio(palette.text, palette.bg), `${id} text/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.textMuted, palette.bg), `${id} textMuted/bg`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.accentText, palette.accent), `${id} accentText/accent`).toBeGreaterThanOrEqual(4.5);
    }
    for (const id of KIT_IDS) {
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(STYLE_KITS[id].palette[key], `${id}.${key}`).toBeTruthy();
      }
    }
  });
});

describe("pickStyleKit", () => {
  it("keeps the shipped five picks and linear fallback stable", () => {
    expect(pickStyleKit("build an admin analytics dashboard with tables and KPI cards").id).toBe("enterprise-admin");
    expect(pickStyleKit("a blog article page with elegant serif typography").id).toBe("editorial");
    expect(pickStyleKit("frosted glass weather widget with blurred backdrop").id).toBe("glass");
    expect(pickStyleKit("dark developer tool for code review issues").id).toBe("linear");
    expect(pickStyleKit("dribbble style product shot, bento showcase with hero metric").id).toBe("dribbble-saas");
    expect(pickStyleKit("analytics dashboard with KPI cards").id).toBe("enterprise-admin");
    expect(pickStyleKit("frosted glass settings page").id).toBe("glass");
    expect(pickStyleKit("editorial magazine").id).toBe("editorial");
    expect(pickStyleKit("make me something nice").id).toBe("linear");
    expect(pickStyleKit("").id).toBe("linear");
    expect(pickStyleKit(undefined).id).toBe("linear");
    expect(pickStyleKit("   \n  ").id).toBe("linear");
  });

  it("routes English keywords to the new kits", () => {
    const cases = [
      ["a literary salon site with playfair display", "editorial-serif"],
      ["swiss grid poster with helvetica and strict columns", "swiss-grid"],
      ["brutalist type poster with hard shadow and acid blocks", "brutalist-type"],
      ["cinematic streaming app with letterbox stills", "cinematic-dark"],
      ["bento tile grid product board", "bento-showcase"],
      ["monochrome grayscale letterpress zine", "monochrome-print"],
      ["handmade pottery bakery brand site", "warm-artisan"],
      ["blueprint schematic diagram for infrastructure", "blueprint-technical"],
      ["neon cyberpunk terminal ui", "neon-console"],
      ["soft clay pastel kids app", "soft-clay"],
      ["luxury jewelry boutique hotel", "luxury-serif"],
      ["monospace technical documentation spec sheet", "technical-mono"],
      ["aurora gradient dreamy landing", "aurora-gradient"],
      ["magazine layout with cover story", "magazine-stack"],
      ["playful colorful candy fun app", "playful-color"],
    ];
    for (const [text, expected] of cases) expect(pickStyleKit(text).id, text).toBe(expected);
  });

  it("routes Chinese keywords to the new kits", () => {
    const cases = [
      ["做一个杂志排版的海报", "magazine-stack"],
      ["极简风格的官网", "swiss-grid"],
      ["暗色终端界面", "neon-console"],
      ["电影感的片单页面", "cinematic-dark"],
      ["手作陶艺品牌", "warm-artisan"],
      ["蓝图风格的工程图", "blueprint-technical"],
      ["粘土质感的亲子应用", "soft-clay"],
      ["奢华珠宝品牌", "luxury-serif"],
      ["极光渐变的登录页", "aurora-gradient"],
      ["多巴胺配色的活动页", "playful-color"],
      ["等宽字体的技术文档", "technical-mono"],
      ["粗野主义的展览海报", "brutalist-type"],
      ["便当式的卡片墙", "bento-showcase"],
      ["黑白铅字印刷风", "monochrome-print"],
    ];
    for (const [text, expected] of cases) expect(pickStyleKit(text).id, text).toBe(expected);
  });

  it("is case insensitive and deterministic", () => {
    const text = "AURORA GRADIENT HERO";
    expect(pickStyleKit(text).id).toBe("aurora-gradient");
    expect(pickStyleKit(text.toLowerCase()).id).toBe(pickStyleKit(text).id);
    expect(pickStyleKit("magazine layout with cover story")).toBe(pickStyleKit("magazine layout with cover story"));
  });
});
