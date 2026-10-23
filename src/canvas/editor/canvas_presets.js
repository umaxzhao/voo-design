/**
 * Canvas size presets: pure data plus the popover's search filter.
 *
 * Sizes are data, never prose: a generic preset labels itself from its own
 * numbers, and only the platform presets carry a translated name. Every
 * dimension must stay inside [MIN_CANVAS_SIZE, MAX_CANVAS_SIZE], the same
 * clamp the custom-size inputs enforce.
 */
import { MIN_DOC_SIZE } from "./scene_model_core.js";

export const MIN_CANVAS_SIZE = MIN_DOC_SIZE;
export const MAX_CANVAS_SIZE = 8192;

export const PRESET_GROUPS = [
  {
    titleKey: "editor.canvas.group.phone",
    items: [
      { w: 393, h: 852, labelKey: "editor.canvas.preset.iphone16Pro" },
      { w: 375, h: 667, labelKey: "editor.canvas.preset.iphoneSE" },
      { w: 360, h: 800, labelKey: "editor.canvas.preset.android" },
    ],
  },
  {
    titleKey: "editor.canvas.group.desktop",
    items: [
      { w: 1440, h: 900, labelKey: "editor.canvas.preset.desktopHD" },
      { w: 1280, h: 832, labelKey: "editor.canvas.preset.macbookAir" },
      { w: 1920, h: 1080, labelKey: "editor.canvas.preset.desktopFullHD" },
    ],
  },
  {
    titleKey: "editor.canvas.group.square",
    items: [
      { w: 1024, h: 1024 },
      { w: 512, h: 512 },
      { w: 2048, h: 2048 },
    ],
  },
  {
    titleKey: "editor.canvas.group.portrait",
    items: [
      { w: 832, h: 1248 },
      { w: 768, h: 1024 },
      { w: 576, h: 1024 },
    ],
  },
  {
    titleKey: "editor.canvas.group.landscape",
    items: [
      { w: 1248, h: 832 },
      { w: 1024, h: 768 },
      { w: 1024, h: 576 },
      { w: 3840, h: 2160, labelKey: "editor.canvas.preset.uhd4k" },
    ],
  },
  {
    titleKey: "editor.canvas.group.social",
    items: [
      { w: 1080, h: 1080, labelKey: "editor.canvas.preset.instagramSquare" },
      { w: 1080, h: 1350, labelKey: "editor.canvas.preset.igPortrait" },
      { w: 1080, h: 1920, labelKey: "editor.canvas.preset.storyReel" },
      { w: 1080, h: 566, labelKey: "editor.canvas.preset.igLandscape" },
      { w: 1600, h: 900, labelKey: "editor.canvas.preset.xPost" },
      { w: 1500, h: 500, labelKey: "editor.canvas.preset.twitterBanner" },
      { w: 800, h: 418, labelKey: "editor.canvas.preset.xCard" },
      { w: 1200, h: 630, labelKey: "editor.canvas.preset.fbPost" },
      { w: 820, h: 312, labelKey: "editor.canvas.preset.facebookCover" },
      { w: 1280, h: 720, labelKey: "editor.canvas.preset.ytThumbnail" },
      { w: 2560, h: 1440, labelKey: "editor.canvas.preset.ytBanner" },
      { w: 1200, h: 627, labelKey: "editor.canvas.preset.linkedinPost" },
      { w: 1584, h: 396, labelKey: "editor.canvas.preset.linkedinBanner" },
      { w: 1000, h: 1500, labelKey: "editor.canvas.preset.pinterestPin" },
      { w: 1000, h: 1000, labelKey: "editor.canvas.preset.pinterestSquare" },
      { w: 1000, h: 2100, labelKey: "editor.canvas.preset.pinterestLong" },
    ],
  },
  {
    titleKey: "editor.canvas.group.chinese",
    items: [
      { w: 1242, h: 1660, labelKey: "editor.canvas.preset.xhsCover" },
      { w: 900, h: 383, labelKey: "editor.canvas.preset.wechatArticle" },
      { w: 1146, h: 717, labelKey: "editor.canvas.preset.bilibiliCover" },
    ],
  },
  {
    titleKey: "editor.canvas.group.documents",
    items: [
      { w: 2480, h: 3508, labelKey: "editor.canvas.preset.docA4" },
      { w: 2550, h: 3300, labelKey: "editor.canvas.preset.docLetter" },
      { w: 1748, h: 2480, labelKey: "editor.canvas.preset.docA5" },
      { w: 3508, h: 4961, labelKey: "editor.canvas.preset.docA3" },
      { w: 1200, h: 1800, labelKey: "editor.canvas.preset.print4x6" },
      { w: 1500, h: 2100, labelKey: "editor.canvas.preset.print5x7" },
      { w: 1920, h: 1080, labelKey: "editor.canvas.preset.slide169" },
      { w: 1024, h: 768, labelKey: "editor.canvas.preset.slide43" },
    ],
  },
];

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/** Formats a ratio fraction nicely. */
export function ratioText(w, h) {
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

/**
 * A preset's stable identity: its translated label when it has one, its
 * dimensions otherwise. Also the React key in the popover list.
 */
export function presetKey(item) {
  return item.labelKey ?? `${item.w}x${item.h}`;
}

/**
 * Filters the preset groups by a free-text query.
 *
 * A preset matches when the query appears in its translated label, its ratio
 * text, or its dimensions; matching is case-insensitive. Groups left with no
 * matching items are dropped. An empty query returns the groups untouched.
 */
export function filterPresetGroups(query, translate) {
  const needle = query.trim().toLowerCase();
  if (!needle) return PRESET_GROUPS;
  return PRESET_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const label = item.labelKey ? translate(item.labelKey) : "";
      const haystack =
        `${label} ${ratioText(item.w, item.h)} ${item.w}x${item.h} ${item.w}×${item.h}`.toLowerCase();
      return haystack.includes(needle);
    }),
  })).filter((group) => group.items.length > 0);
}
