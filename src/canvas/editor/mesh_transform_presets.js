/**
 * Photoshop & Photopea-compatible Bicubic Warp Presets Generator.
 *
 * Implements canonical 16-point control meshes for Arc, Arch, Bulge, Flag, Wave,
 * Fish, Rise, Fisheye, Inflate, Squeeze, Twist, Fan, and Trapezoid with Bend and
 * Distortion axes.
 */

/**
 * Canonical Photoshop-style warp preset ids, in the exact order of the
 * switch branches in generatePhotoshopWarpPreset(). Single source of truth
 * for the preset list (UI iterates this table); do not add an id here
 * without adding the matching case branch below.
 */
export const PHOTOSHOP_WARP_PRESETS = [
  "arc",
  "arc_lower",
  "arc_upper",
  "arch",
  "bulge",
  "shell_lower",
  "shell_upper",
  "flag",
  "wave",
  "fish",
  "rise",
  "fisheye",
  "inflate",
  "squeeze",
  "twist",
  "fan",
  "trapezoid",
];

/**
 * Standard Photoshop & Photopea Warp Presets generator:
 * Generates 4x4 (16-point) Bicubic Bézier control points supporting:
 * - Style Presets: Arc, Arc Lower, Arc Upper, Arch, Bulge, Shell Lower, Shell Upper, Flag, Wave, Fish, Rise, Fisheye, Inflate, Squeeze, Twist, Trapezoid.
 * - Parameters: Bend (-100% to 100%), Horizontal Distortion (-100% to 100%), Vertical Distortion (-100% to 100%), Orientation (H/V).
 * Preset ids come from PHOTOSHOP_WARP_PRESETS; an unknown id falls through
 * to the switch default and yields an undeformed grid.
 */
export function generatePhotoshopWarpPreset(
  presetName = "arc",
  bend = 0.5,
  hDistort = 0,
  vDistort = 0,
  orientation = "horizontal",
) {
  const points = [];
  const isVert = orientation === "vertical";

  for (let j = 0; j < 4; j++) {
    const v0 = j / 3;
    for (let i = 0; i < 4; i++) {
      const u0 = i / 3;

      // Coordinate mapping relative to orientation
      let primary = isVert ? v0 : u0;
      let secondary = isVert ? u0 : v0;

      let normP = primary * 2 - 1; // [-1, 1]
      let normS = secondary * 2 - 1; // [-1, 1]

      let deltaSec = 0;
      let deltaPri = 0;

      switch (presetName) {
        case "arc": {
          deltaSec = -(1 - normP * normP) * (bend * 0.45);
          break;
        }
        case "arc_lower": {
          deltaSec = -(1 - normP * normP) * (bend * 0.45) * secondary;
          break;
        }
        case "arc_upper": {
          deltaSec = -(1 - normP * normP) * (bend * 0.45) * (1 - secondary);
          break;
        }
        case "arch": {
          const curve = Math.max(0, 1 - normP * normP) * (bend * 0.5);
          deltaSec = -curve * (1 - secondary * 0.5);
          break;
        }
        case "bulge": {
          deltaSec = -(1 - normP * normP) * (bend * 0.4) * normS;
          break;
        }
        case "shell_lower": {
          const taper = (normP + 1) * 0.5; // [0, 1]
          deltaSec = -(1 - normP * normP) * (bend * 0.4) * taper;
          break;
        }
        case "shell_upper": {
          const taper = (1 - normP) * 0.5; // [0, 1]
          deltaSec = -(1 - normP * normP) * (bend * 0.4) * taper;
          break;
        }
        case "flag": {
          deltaSec = Math.sin(normP * Math.PI) * (bend * 0.28);
          break;
        }
        case "wave": {
          deltaSec = Math.sin(normP * Math.PI * 1.5) * (bend * 0.22);
          break;
        }
        case "fish": {
          const scale = 1 - (normP * 0.5 + 0.5) * bend * 0.55;
          normS *= scale;
          secondary = normS * 0.5 + 0.5;
          break;
        }
        case "rise": {
          deltaSec = -(
            normP * (bend * 0.35) +
            (1 - normP * normP) * (bend * 0.15)
          );
          break;
        }
        case "fisheye": {
          const dist = Math.hypot(normP, normS);
          const factor = 1 + bend * (1 - Math.min(1, dist));
          normP /= factor;
          normS /= factor;
          primary = normP * 0.5 + 0.5;
          secondary = normS * 0.5 + 0.5;
          break;
        }
        case "inflate": {
          const curveP = (1 - normS * normS) * (bend * 0.22);
          const curveS = (1 - normP * normP) * (bend * 0.22);
          normP += normP > 0 ? curveP : -curveP;
          normS += normS > 0 ? curveS : -curveS;
          primary = normP * 0.5 + 0.5;
          secondary = normS * 0.5 + 0.5;
          break;
        }
        case "squeeze": {
          const curveP = (1 - normS * normS) * (-bend * 0.22);
          const curveS = (1 - normP * normP) * (-bend * 0.22);
          normP += normP > 0 ? curveP : -curveP;
          normS += normS > 0 ? curveS : -curveS;
          primary = normP * 0.5 + 0.5;
          secondary = normS * 0.5 + 0.5;
          break;
        }
        case "twist": {
          const dist = Math.hypot(normP, normS);
          const angle = (1 - Math.min(1, dist)) * (bend * Math.PI * 0.5);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const rx = normP * cosA - normS * sinA;
          const ry = normP * sinA + normS * cosA;
          primary = rx * 0.5 + 0.5;
          secondary = ry * 0.5 + 0.5;
          break;
        }
        case "fan": {
          const angle = normP * (bend * 0.65);
          const radius = (secondary + 0.5) * (1 - bend * 0.2);
          primary = 0.5 + Math.sin(angle) * radius * 0.5;
          secondary = 1.0 - Math.cos(angle) * radius * 0.7;
          break;
        }
        case "trapezoid": {
          const topScale = Math.max(0.05, 1 - bend * 0.7);
          const currentScale = 1 - (1 - secondary) * (1 - topScale);
          primary = 0.5 + normP * 0.5 * currentScale;
          break;
        }
        default:
          break;
      }

      secondary += deltaSec;
      primary += deltaPri;

      // Apply Horizontal Distortion & Vertical Distortion (Perspective Tapering)
      let curU = isVert ? secondary : primary;
      let curV = isVert ? primary : secondary;

      if (hDistort !== 0) {
        const factorH = 1 + (curU * 2 - 1) * (hDistort * 0.4);
        curV = 0.5 + (curV - 0.5) * factorH;
      }

      if (vDistort !== 0) {
        const factorV = 1 + (curV * 2 - 1) * (vDistort * 0.4);
        curU = 0.5 + (curU - 0.5) * factorV;
      }

      points.push({ x: curU, y: curV, origU: u0, origV: v0 });
    }
  }

  return points;
}
