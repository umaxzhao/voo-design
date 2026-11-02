/** Local retouch dabs: blur, sharpen, smudge, dodge, burn, and sponge. */

import { softBrushAlpha } from "./scene_renderer.js";
import { brushModeDrawField } from "./brush_pressure.js";

/**
 * The per-dab effect force for a retouch mode.
 *
 * Dodge/Burn scale their exposure by Flow; Sponge scales its saturating force
 * by Opacity. Both scale factors are independent fields, so changing Flow
 * never changes Exposure.
 */
export function retouchModeAmount(paintEdit) {
  let amount =
    paintEdit[brushModeDrawField(paintEdit.mode)] ?? paintEdit.strength;
  if (paintEdit.mode === "dodge" || paintEdit.mode === "burn") {
    amount *= paintEdit.flow ?? 1;
  } else if (paintEdit.mode === "sponge") {
    amount *= paintEdit.opacity ?? 1;
  }
  return amount;
}

/** Applies one soft local retouch dab without creating a second raster path. */
export function stampRetouch(canvas, x, y, diameter, coverage, paintEdit) {
  const ctx = canvas.getContext("2d");
  const radius = Math.max(1, Math.round(diameter / 2));
  const left = Math.max(0, Math.floor(x - radius));
  const top = Math.max(0, Math.floor(y - radius));
  const right = Math.min(canvas.width, Math.ceil(x + radius));
  const bottom = Math.min(canvas.height, Math.ceil(y + radius));
  if (right <= left || bottom <= top) return;
  const width = right - left;
  const height = bottom - top;
  if (paintEdit.mode === "smudge") {
    // Procreate-style smudge: capture the untouched pixels once at the
    // beginning of the stroke, then drag that source field with the brush.
    // Sampling from the already-written canvas makes a stroke collapse into
    // blur after a few dabs and is the main reason the old tool felt broken.
    if (!paintEdit.retouchSnapshot) {
      paintEdit.retouchSnapshot = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      paintEdit.retouchOrigin = { x, y };
    }
    const source = paintEdit.retouchSnapshot;
    const origin = paintEdit.retouchOrigin;
    const totalDx = x - origin.x;
    const totalDy = y - origin.y;
    const original = ctx.getImageData(left, top, width, height);
    const sourceIndexAt = (px, py) => (py * source.width + px) * 4;
    const targetIndexAt = (px, py) => ((py - top) * width + (px - left)) * 4;
    const amount = Math.min(1, Math.max(0, paintEdit.strength * coverage));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const distance = Math.hypot(px - x, py - y);
        if (distance > radius) continue;
        const falloff =
          amount * softBrushAlpha(distance / radius, paintEdit.hardness);
        const sx = Math.max(
          0,
          Math.min(source.width - 1, Math.round(px - totalDx)),
        );
        const sy = Math.max(
          0,
          Math.min(source.height - 1, Math.round(py - totalDy)),
        );
        const sourceIndex = sourceIndexAt(sx, sy);
        const targetIndex = targetIndexAt(px, py);
        // ImageData stores straight-alpha colour. Mixing only RGB leaves a
        // transparent destination transparent, so a smudge disappears as
        // soon as it is pulled over an empty part of the layer. Blend the
        // premultiplied channels and alpha together, then return to
        // straight-alpha storage to avoid transparent-colour fringes.
        const sourceAlpha = source.data[sourceIndex + 3] / 255;
        const targetAlpha = original.data[targetIndex + 3] / 255;
        const outputAlpha = targetAlpha + (sourceAlpha - targetAlpha) * falloff;
        for (let channel = 0; channel < 3; channel += 1) {
          const sourcePremultiplied =
            source.data[sourceIndex + channel] * sourceAlpha;
          const targetPremultiplied =
            original.data[targetIndex + channel] * targetAlpha;
          const outputPremultiplied =
            targetPremultiplied +
            (sourcePremultiplied - targetPremultiplied) * falloff;
          original.data[targetIndex + channel] =
            outputAlpha > 0 ? outputPremultiplied / outputAlpha : 0;
        }
        original.data[targetIndex + 3] = outputAlpha * 255;
      }
    }
    ctx.putImageData(original, left, top);
    paintEdit.retouchLast = { x, y };
    return;
  }
  const source = ctx.getImageData(left, top, width, height);
  const original = new Uint8ClampedArray(source.data);
  // Each mode draws its effect force from its own independent field — never
  // a shared opacity/flow alias — so changing Smudge strength can never
  // retouch Opacity, and so on.
  const modeAmount = retouchModeAmount(paintEdit);
  const amount = Math.min(1, Math.max(0, modeAmount * coverage));
  const indexAt = (px, py) => ((py - top) * width + (px - left)) * 4;
  const { protectLuminosity, tonalRange } = paintEdit;
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const distance = Math.hypot(px - x, py - y);
      if (distance > radius) continue;
      let falloff = amount * (1 - distance / radius);
      const index = indexAt(px, py);
      let target = [original[index], original[index + 1], original[index + 2]];
      if (paintEdit.mode === "blur" || paintEdit.mode === "smudge") {
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = Math.min(right - 1, Math.max(left, px + ox));
            const sy = Math.min(bottom - 1, Math.max(top, py + oy));
            const sample = original[indexAt(sx, sy)];
            red += sample;
            green += original[indexAt(sx, sy) + 1];
            blue += original[indexAt(sx, sy) + 2];
            count += 1;
          }
        }
        target = [red / count, green / count, blue / count];
      } else if (paintEdit.mode === "sharpen") {
        target = [
          original[index] * 2 -
            (original[indexAt(Math.max(left, px - 1), py)] +
              original[indexAt(Math.min(right - 1, px + 1), py)]) /
              2,
          original[index + 1] * 2 -
            (original[indexAt(Math.max(left, px - 1), py) + 1] +
              original[indexAt(Math.min(right - 1, px + 1), py) + 1]) /
              2,
          original[index + 2] * 2 -
            (original[indexAt(Math.max(left, px - 1), py) + 2] +
              original[indexAt(Math.min(right - 1, px + 1), py) + 2]) /
              2,
        ];
      } else if (paintEdit.mode === "dodge" || paintEdit.mode === "burn") {
        // Tonal-range gate: only act on pixels near the selected band
        // (Shadows < Midtones < Highlights), softly weighted by luminance.
        const lum =
          (0.299 * original[index] +
            0.587 * original[index + 1] +
            0.114 * original[index + 2]) /
          255;
        const rangeWeight =
          tonalRange === "shadows"
            ? 1 - lum
            : tonalRange === "highlights"
              ? lum
              : Math.max(0, 1 - Math.abs(lum - 0.5) * 2);
        falloff *= rangeWeight;
        // The final interpolation applies exposure, coverage and the tonal
        // gate once. Squaring that weight rounds ordinary mouse dabs to zero.
        const factor = paintEdit.mode === "dodge" ? 1.8 : 0.2;
        target = target.map((channel) => channel * factor);
      } else if (paintEdit.mode === "sponge") {
        // Saturate pushes channels apart from their mean; desaturate pulls
        // them toward it. The direction is an independent toggle.
        const mean = (target[0] + target[1] + target[2]) / 3;
        const push = paintEdit.saturating ? 1.8 : 0.2;
        target = target.map((channel) => mean + (channel - mean) * push);
      }
      source.data[index] =
        original[index] + (target[0] - original[index]) * falloff;
      source.data[index + 1] =
        original[index + 1] + (target[1] - original[index + 1]) * falloff;
      source.data[index + 2] =
        original[index + 2] + (target[2] - original[index + 2]) * falloff;
      if (
        protectLuminosity &&
        (paintEdit.mode === "dodge" || paintEdit.mode === "burn")
      ) {
        // Protect tones: dodge never blows a channel to full white, burn
        // never crushes one to full black.
        source.data[index] =
          paintEdit.mode === "dodge"
            ? Math.min(235, source.data[index])
            : Math.max(20, source.data[index]);
        source.data[index + 1] =
          paintEdit.mode === "dodge"
            ? Math.min(235, source.data[index + 1])
            : Math.max(20, source.data[index + 1]);
        source.data[index + 2] =
          paintEdit.mode === "dodge"
            ? Math.min(235, source.data[index + 2])
            : Math.max(20, source.data[index + 2]);
      }
    }
  }
  ctx.putImageData(source, left, top);
  paintEdit.retouchLast = { x, y };
}
