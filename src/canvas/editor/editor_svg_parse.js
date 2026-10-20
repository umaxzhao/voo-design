/**
 * SVG path string tokenizer and parser.
 *
 * Extracted from editor_svg.js to keep both modules under 400 lines.
 */

/** Splits an SVG path `d` into command letters and numeric arguments. */
export function tokenizePath(d) {
  const tokens = [];
  const re =
    /([AaCcHhLlMmQqSsTtVvZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = re.exec(d)) !== null) {
    if (match[1]) {
      tokens.push({ type: "cmd", value: match[1] });
    } else {
      tokens.push({ type: "num", value: parseFloat(match[2]) });
    }
  }
  return tokens;
}

function arcToBeziers(x1, y1, rx, ry, angleDeg, largeArcFlag, sweepFlag, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  const absRx = Math.abs(rx);
  const absRy = Math.abs(ry);
  if (absRx === 0 || absRy === 0) return [{ x1, y1, x2, y2, x: x2, y: y2 }];

  const phi = ((angleDeg % 360) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let prx = absRx;
  let pry = absRy;
  const lambda = (x1p * x1p) / (prx * prx) + (y1p * y1p) / (pry * pry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    prx *= sqrtLambda;
    pry *= sqrtLambda;
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const sqNumerator = prx * prx * pry * pry - prx * prx * y1p * y1p - pry * pry * x1p * x1p;
  const sqDenominator = prx * prx * y1p * y1p + pry * pry * x1p * x1p;
  const sq = Math.max(0, sqNumerator / (sqDenominator || 1));
  const coef = sign * Math.sqrt(sq);
  const cxp = coef * ((prx * y1p) / pry);
  const cyp = coef * (-(pry * x1p) / prx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const v1x = (x1p - cxp) / prx;
  const v1y = (y1p - cyp) / pry;
  const v2x = (-x1p - cxp) / prx;
  const v2y = (-y1p - cyp) / pry;

  const theta1 = Math.atan2(v1y, v1x);
  let dTheta = Math.atan2(v2y, v2x) - theta1;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;
  else if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const beziers = [];

  let curTheta = theta1;
  for (let s = 0; s < segments; s++) {
    const nextTheta = curTheta + delta;
    const alpha = (Math.sin(delta) * (Math.sqrt(4 + 3 * Math.tan(delta / 2) ** 2) - 1)) / 3;

    const cosT1 = Math.cos(curTheta);
    const sinT1 = Math.sin(curTheta);
    const cosT2 = Math.cos(nextTheta);
    const sinT2 = Math.sin(nextTheta);

    const cp1x = cx + cosPhi * (prx * (cosT1 - alpha * sinT1)) - sinPhi * (pry * (sinT1 + alpha * cosT1));
    const cp1y = cy + sinPhi * (prx * (cosT1 - alpha * sinT1)) + cosPhi * (pry * (sinT1 + alpha * cosT1));
    const cp2x = cx + cosPhi * (prx * (cosT2 + alpha * sinT2)) - sinPhi * (pry * (sinT2 - alpha * cosT2));
    const cp2y = cy + sinPhi * (prx * (cosT2 + alpha * sinT2)) + cosPhi * (pry * (sinT2 - alpha * cosT2));
    const endX = s === segments - 1 ? x2 : cx + cosPhi * (prx * cosT2) - sinPhi * (pry * sinT2);
    const endY = s === segments - 1 ? y2 : cy + sinPhi * (prx * cosT2) + cosPhi * (pry * sinT2);

    beziers.push({ x1: cp1x, y1: cp1y, x2: cp2x, y2: cp2y, x: endX, y: endY });
    curTheta = nextTheta;
  }
  return beziers;
}

/**
 * Parses an SVG path `d` into editor pen anchors.
 *
 * Supports M/m (move), L/l (line), H/h (horizontal), V/v (vertical),
 * C/c (cubic bezier), S/s (smooth cubic), Q/q (quadratic), A/a (arc),
 * and Z/z (close).
 */
export function parseSvgPath(d) {
  if (typeof d !== "string" || !d.trim()) return [];
  const tokens = tokenizePath(d);
  const anchors = [];
  let cur = null;
  let start = null;
  let i = 0;
  let cmd = null;
  let lastControl = null;

  const requireNum = () => {
    const token = tokens[i];
    if (!token || token.type !== "num") {
      throw new Error(`parseSvgPath: expected a number at token ${i}`);
    }
    i += 1;
    return token.value;
  };
  const last = () => anchors[anchors.length - 1];

  const SUPPORTED_CMDS = new Set([
    "M", "m", "L", "l", "H", "h", "V", "v",
    "C", "c", "S", "s", "Q", "q", "A", "a", "Z", "z",
  ]);

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === "cmd") {
      cmd = token.value;
      i += 1;
    } else if (cmd == null || !SUPPORTED_CMDS.has(cmd)) {
      throw new Error("parseSvgPath: unexpected number with no active command");
    }

    switch (cmd) {
      case "M": {
        const x = requireNum();
        const y = requireNum();
        cur = { x, y };
        start = { x, y };
        anchors.push({ x, y });
        cmd = "L";
        lastControl = null;
        break;
      }
      case "m": {
        const dx = requireNum();
        const dy = requireNum();
        const x = cur ? cur.x + dx : dx;
        const y = cur ? cur.y + dy : dy;
        cur = { x, y };
        start = { x, y };
        anchors.push({ x, y });
        cmd = "l";
        lastControl = null;
        break;
      }
      case "L": {
        const x = requireNum();
        const y = requireNum();
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "l": {
        const dx = requireNum();
        const dy = requireNum();
        const x = cur ? cur.x + dx : dx;
        const y = cur ? cur.y + dy : dy;
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "H": {
        const x = requireNum();
        const y = cur ? cur.y : 0;
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "h": {
        const dx = requireNum();
        const x = cur ? cur.x + dx : dx;
        const y = cur ? cur.y : 0;
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "V": {
        const x = cur ? cur.x : 0;
        const y = requireNum();
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "v": {
        const dy = requireNum();
        const x = cur ? cur.x : 0;
        const y = cur ? cur.y + dy : dy;
        anchors.push({ x, y });
        cur = { x, y };
        lastControl = null;
        break;
      }
      case "C": {
        const x1 = requireNum();
        const y1 = requireNum();
        const x2 = requireNum();
        const y2 = requireNum();
        const x = requireNum();
        const y = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: C command has no anchor to attach to");
        from.out = [x1 - from.x, y1 - from.y];
        anchors.push({ x, y, in: [x2 - x, y2 - y] });
        cur = { x, y };
        lastControl = { x: x2, y: y2 };
        break;
      }
      case "c": {
        const x1 = requireNum();
        const y1 = requireNum();
        const x2 = requireNum();
        const y2 = requireNum();
        const dx = requireNum();
        const dy = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: c command has no anchor to attach to");
        const cx1 = from.x + x1;
        const cy1 = from.y + y1;
        const cx2 = from.x + x2;
        const cy2 = from.y + y2;
        const ex = from.x + dx;
        const ey = from.y + dy;
        from.out = [cx1 - from.x, cy1 - from.y];
        anchors.push({ x: ex, y: ey, in: [cx2 - ex, cy2 - ey] });
        cur = { x: ex, y: ey };
        lastControl = { x: cx2, y: cy2 };
        break;
      }
      case "S": {
        const x2 = requireNum();
        const y2 = requireNum();
        const x = requireNum();
        const y = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: S command has no anchor to attach to");
        const cp1x = lastControl ? 2 * from.x - lastControl.x : from.x;
        const cp1y = lastControl ? 2 * from.y - lastControl.y : from.y;
        from.out = [cp1x - from.x, cp1y - from.y];
        anchors.push({ x, y, in: [x2 - x, y2 - y] });
        cur = { x, y };
        lastControl = { x: x2, y: y2 };
        break;
      }
      case "s": {
        const dx2 = requireNum();
        const dy2 = requireNum();
        const dx = requireNum();
        const dy = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: s command has no anchor to attach to");
        const cp1x = lastControl ? 2 * from.x - lastControl.x : from.x;
        const cp1y = lastControl ? 2 * from.y - lastControl.y : from.y;
        const ex = from.x + dx;
        const ey = from.y + dy;
        const cx2 = from.x + dx2;
        const cy2 = from.y + dy2;
        from.out = [cp1x - from.x, cp1y - from.y];
        anchors.push({ x: ex, y: ey, in: [cx2 - ex, cy2 - ey] });
        cur = { x: ex, y: ey };
        lastControl = { x: cx2, y: cy2 };
        break;
      }
      case "Q": {
        const qx = requireNum();
        const qy = requireNum();
        const x = requireNum();
        const y = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: Q command has no anchor to attach to");
        // Quadratic to cubic bezier conversion
        const cp1x = from.x + (2 / 3) * (qx - from.x);
        const cp1y = from.y + (2 / 3) * (qy - from.y);
        const cp2x = x + (2 / 3) * (qx - x);
        const cp2y = y + (2 / 3) * (qy - y);
        from.out = [cp1x - from.x, cp1y - from.y];
        anchors.push({ x, y, in: [cp2x - x, cp2y - y] });
        cur = { x, y };
        lastControl = { x: qx, y: qy };
        break;
      }
      case "q": {
        const dqx = requireNum();
        const dqy = requireNum();
        const dx = requireNum();
        const dy = requireNum();
        const from = last();
        if (!from) throw new Error("parseSvgPath: q command has no anchor to attach to");
        const qx = from.x + dqx;
        const qy = from.y + dqy;
        const ex = from.x + dx;
        const ey = from.y + dy;
        const cp1x = from.x + (2 / 3) * (qx - from.x);
        const cp1y = from.y + (2 / 3) * (qy - from.y);
        const cp2x = ex + (2 / 3) * (qx - ex);
        const cp2y = ey + (2 / 3) * (qy - ey);
        from.out = [cp1x - from.x, cp1y - from.y];
        anchors.push({ x: ex, y: ey, in: [cp2x - ex, cp2y - ey] });
        cur = { x: ex, y: ey };
        lastControl = { x: qx, y: qy };
        break;
      }
      case "A":
      case "a": {
        const rx = requireNum();
        const ry = requireNum();
        const angle = requireNum();
        const largeArc = requireNum();
        const sweep = requireNum();
        const rawX = requireNum();
        const rawY = requireNum();
        const from = last() || { x: 0, y: 0 };
        const ex = cmd === "a" ? from.x + rawX : rawX;
        const ey = cmd === "a" ? from.y + rawY : rawY;
        const beziers = arcToBeziers(from.x, from.y, rx, ry, angle, largeArc, sweep, ex, ey);
        let prevPt = from;
        for (const b of beziers) {
          prevPt.out = [b.x1 - prevPt.x, b.y1 - prevPt.y];
          const newAnchor = { x: b.x, y: b.y, in: [b.x2 - b.x, b.y2 - b.y] };
          anchors.push(newAnchor);
          prevPt = newAnchor;
        }
        cur = { x: ex, y: ey };
        lastControl = null;
        break;
      }
      case "Z":
      case "z": {
        const end = last();
        if (end) end.close = true;
        cur = start;
        lastControl = null;
        break;
      }
      default:
        throw new Error(`parseSvgPath: unsupported command "${cmd}"`);
    }
  }
  return anchors;
}
