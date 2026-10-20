import { SIMPLE_ADJUSTMENTS } from "./adjustment_kinds.js";

/** The identity curve used to pad a freshly added curves adjustment. */
function identityCurve() {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

/** A non-neutral adjustment patch for "add", so the row shows up. */
export function starterAdjustment(kind) {
  switch (kind) {
    case "levels":
      return {
        enabled: true,
        black: 5,
        white: 100,
        gamma: 1,
        outBlack: 0,
        outWhite: 100,
      };
    case "invert":
      return { enabled: true };
    case "threshold":
      return { enabled: true, value: 128 };
    case "curves":
      return {
        enabled: true,
        luminance: [...identityCurve(), { x: 0.5, y: 0.55 }],
        r: identityCurve(),
        g: identityCurve(),
        b: identityCurve(),
      };
    case "colorBalance":
      return {
        enabled: true,
        preserveLuminosity: true,
        shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        midtones: { cyanRed: 10, magentaGreen: 0, yellowBlue: 0 },
        highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      };
    case "blackAndWhite":
      return {
        enabled: true,
        reds: 40,
        yellows: 60,
        greens: 40,
        cyans: 60,
        blues: 20,
        magentas: 80,
        useTint: false,
        tintColor: "#ffffff",
      };
    case "vibrance":
      return { enabled: true, value: 15 };
    case "photoFilter":
      return {
        enabled: true,
        color: "#f5a623",
        density: 25,
        preserveLuminosity: true,
      };
    case "channelMixer":
      return {
        enabled: true,
        monochrome: false,
        red: { red: 90, green: 10, blue: 0, constant: 0 },
        green: { red: 0, green: 100, blue: 0, constant: 0 },
        blue: { red: 0, green: 0, blue: 100, constant: 0 },
        gray: { red: 40, green: 40, blue: 20, constant: 0 },
      };
    case "selectiveColor":
      return {
        enabled: true,
        mode: "relative",
        reds: { c: 10, m: 0, y: 0, k: 0 },
      };
    case "gradientMap":
      return {
        enabled: true,
        reverse: false,
        stops: [
          { color: "#000000", location: 0 },
          { color: "#ffffff", location: 1 },
        ],
      };
    default: {
      const meta = SIMPLE_ADJUSTMENTS.find((a) => a.kind === kind);
      return { enabled: true, value: meta?.starter ?? 10 };
    }
  }
}

/** The effect patch for "add" (the defaults the effects panel uses). */
export function starterEffect(kind) {
  const defaults = {
    shadow: {
      enabled: true,
      color: "#000000",
      blur: 8,
      offsetX: 0,
      offsetY: 4,
      opacity: 80,
    },
    glow: {
      enabled: true,
      color: "#ffd166",
      blur: 12,
      spread: 0,
      opacity: 100,
    },
    innerShadow: {
      enabled: true,
      color: "#000000",
      blur: 8,
      offsetX: 0,
      offsetY: 4,
      opacity: 75,
    },
    innerGlow: {
      enabled: true,
      color: "#ffd166",
      blur: 12,
      size: 8,
      opacity: 100,
    },
    satin: {
      enabled: true,
      color: "#000000",
      blur: 8,
      distance: 5,
      angle: 120,
      invert: false,
      opacity: 75,
    },
    bevel: { enabled: true, depth: 60, size: 8, angle: 135, softness: 30 },
    fill: { enabled: true, color: "#22c55e", opacity: 100 },
    gradientOverlay: {
      enabled: true,
      stops: [
        { color: "#22c55e", location: 0 },
        { color: "#0ea5e9", location: 1 },
      ],
      angle: 90,
      opacity: 100,
    },
    stroke: {
      enabled: true,
      color: "#000000",
      width: 2,
      position: "center",
      opacity: 100,
    },
  };
  return defaults[kind] ?? null;
}
