export function hexToRgb(hex) {
  let c = (hex || "").replace("#", "").trim();
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  } else if (c.length === 8) {
    c = c.slice(0, 6);
  }
  if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) {
    return null;
  }
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

const toHexChannel = (x) => {
  const clamped = Math.max(0, Math.min(255, Math.round(x)));
  return clamped.toString(16).padStart(2, "0");
};

export function rgbToHex({ r, g, b }) {
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`.toUpperCase();
}

export function normalizeHex(input) {
  const rgb = hexToRgb(input);
  return rgb ? rgbToHex(rgb) : null;
}

export function hexAlphaPercent(hex) {
  const c = (hex || "").replace("#", "").trim();
  if (c.length !== 8) return 100;
  return Math.round((parseInt(c.slice(6, 8), 16) / 255) * 100);
}

export function withAlpha(hex, opacityPercent) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const c = (hex || "").replace("#", "").trim();
  const baseByte = c.length === 8 ? parseInt(c.slice(6, 8), 16) : 255;
  const effByte = Math.round(
    Math.max(0, Math.min(255, (baseByte * opacityPercent) / 100)),
  );
  if (effByte >= 255) return rgbToHex(rgb);
  const alphaHex = effByte.toString(16).padStart(2, "0");
  return `${rgbToHex(rgb)}${alphaHex}`.toUpperCase();
}

export function hexToHsv(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { h: 0, s: 0, v: 100 };
  }
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

export function hsvToHex(h, s, v) {
  s /= 100;
  v /= 100;
  const i = Math.floor((h / 60) % 6);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0,
    g = 0,
    b = 0;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  return rgbToHex({
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  });
}
