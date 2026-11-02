import PropTypes from "prop-types";
import { useEffect, useRef, useCallback } from "react";
import { hexToHsv, hsvToHex } from "./color_math.js";

/**
 * Standard HSV Triangle Color Wheel (Photoshop / Corel Painter / Photopea style):
 * - Outer Ring: Hue (0 - 360°) with circular handle
 * - Inner Triangle: Pure Hue (pointing towards Hue angle or fixed right) to Black to White (Saturation & Value) with picker handle
 */
export default function ColorWheel({
  color = "#ffffff",
  onChange,
  size = 180,
}) {
  const canvasRef = useRef(null);
  const dragModeRef = useRef(null); // 'ring' | 'triangle' | null
  const hsv = hexToHsv(color);

  // Outer Ring dimensions
  const radius = size / 2;
  const ringThickness = 16;
  const innerRadius = radius - ringThickness;
  const triangleRadius = innerRadius - 2;

  // Compute triangle vertices based on current Hue rotation
  // Top-Right vertex points towards Hue angle; the other two are rotated +/- 120 deg
  const getTriangleVertices = useCallback(() => {
    const angleRad = (hsv.h * Math.PI) / 180;
    // Vertex 0: Pure Hue (Sat: 100, Val: 100)
    const pPure = {
      x: radius + triangleRadius * Math.cos(angleRad),
      y: radius + triangleRadius * Math.sin(angleRad),
    };
    // Vertex 1: White (Sat: 0, Val: 100) -> angle + 120 deg
    const pWhite = {
      x: radius + triangleRadius * Math.cos(angleRad + (2 * Math.PI) / 3),
      y: radius + triangleRadius * Math.sin(angleRad + (2 * Math.PI) / 3),
    };
    // Vertex 2: Black (Val: 0) -> angle - 120 deg
    const pBlack = {
      x: radius + triangleRadius * Math.cos(angleRad - (2 * Math.PI) / 3),
      y: radius + triangleRadius * Math.sin(angleRad - (2 * Math.PI) / 3),
    };
    return { pPure, pWhite, pBlack };
  }, [hsv.h, radius, triangleRadius]);

  // Barycentric coordinates inside the SV triangle
  const getPointFromSV = useCallback(() => {
    const { pPure, pWhite, pBlack } = getTriangleVertices();
    const s = hsv.s / 100;
    const v = hsv.v / 100;

    // Weight of Pure Hue: s * v
    // Weight of White: (1 - s) * v
    // Weight of Black: 1 - v
    const wPure = s * v;
    const wWhite = (1 - s) * v;
    const wBlack = 1 - v;

    return {
      x: wPure * pPure.x + wWhite * pWhite.x + wBlack * pBlack.x,
      y: wPure * pPure.y + wWhite * pWhite.y + wBlack * pBlack.y,
    };
  }, [getTriangleVertices, hsv.s, hsv.v]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    // 1. Draw Outer Hue Ring
    const step = (Math.PI * 2) / 360;
    for (let i = 0; i < 360; i += 0.5) {
      const startAngle = (i * Math.PI) / 180;
      const endAngle = startAngle + step * 1.2;
      ctx.beginPath();
      ctx.arc(radius, radius, (radius + innerRadius) / 2, startAngle, endAngle);
      ctx.strokeStyle = `hsl(${i}, 100%, 50%)`;
      ctx.lineWidth = ringThickness + 0.5;
      ctx.stroke();
    }

    // 2. Draw Ring Border
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(radius, radius, innerRadius + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Draw Inner SV Triangle with rich gradient interpolation
    const { pPure, pWhite, pBlack } = getTriangleVertices();

    // Clip to triangle
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pPure.x, pPure.y);
    ctx.lineTo(pWhite.x, pWhite.y);
    ctx.lineTo(pBlack.x, pBlack.y);
    ctx.closePath();
    ctx.clip();

    // Base fill: pure hue
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fill();

    // White gradient: from White vertex towards opposite edge
    const gradWhite = ctx.createLinearGradient(
      pWhite.x,
      pWhite.y,
      (pPure.x + pBlack.x) / 2,
      (pPure.y + pBlack.y) / 2,
    );
    gradWhite.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradWhite.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradWhite;
    ctx.fill();

    // Black gradient: from Black vertex towards opposite edge
    const gradBlack = ctx.createLinearGradient(
      pBlack.x,
      pBlack.y,
      (pPure.x + pWhite.x) / 2,
      (pPure.y + pWhite.y) / 2,
    );
    gradBlack.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradBlack.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradBlack;
    ctx.fill();

    ctx.restore();

    // Triangle outline
    ctx.beginPath();
    ctx.moveTo(pPure.x, pPure.y);
    ctx.lineTo(pWhite.x, pWhite.y);
    ctx.lineTo(pBlack.x, pBlack.y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Draw Hue Ring Handle
    const ringAngleRad = (hsv.h * Math.PI) / 180;
    const ringHandleR = (radius + innerRadius) / 2;
    const rx = radius + ringHandleR * Math.cos(ringAngleRad);
    const ry = radius + ringHandleR * Math.sin(ringAngleRad);

    ctx.beginPath();
    ctx.arc(rx, ry, ringThickness / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();

    // 5. Draw SV Triangle Handle
    const svPos = getPointFromSV();
    ctx.beginPath();
    ctx.arc(svPos.x, svPos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hsv.v < 40 ? "#ffffff" : "#000000";
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.stroke();
  }, [
    color,
    getPointFromSV,
    getTriangleVertices,
    hsv.h,
    hsv.v,
    innerRadius,
    radius,
    ringThickness,
    size,
  ]);

  useEffect(() => {
    render();
  }, [render]);

  // Triangle hit testing & coordinate conversion
  const updateSVFromPoint = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      const { pPure, pWhite, pBlack } = getTriangleVertices();

      // Compute barycentric weights for (px, py)
      const det =
        (pWhite.y - pBlack.y) * (pPure.x - pBlack.x) +
        (pBlack.x - pWhite.x) * (pPure.y - pBlack.y);

      let wPure =
        ((pWhite.y - pBlack.y) * (px - pBlack.x) +
          (pBlack.x - pWhite.x) * (py - pBlack.y)) /
        det;
      let wWhite =
        ((pBlack.y - pPure.y) * (px - pBlack.x) +
          (pPure.x - pBlack.x) * (py - pBlack.y)) /
        det;
      let wBlack = 1 - wPure - wWhite;

      // Clamp into triangle bounds
      wPure = Math.max(0, Math.min(1, wPure));
      wWhite = Math.max(0, Math.min(1, wWhite));
      wBlack = Math.max(0, Math.min(1, wBlack));
      const sum = wPure + wWhite + wBlack;
      if (sum > 0) {
        wPure /= sum;
        wWhite /= sum;
        wBlack /= sum;
      }

      // Value = 1 - wBlack
      const v = Math.max(0, Math.min(100, Math.round((1 - wBlack) * 100)));
      // Saturation = wPure / (wPure + wWhite)
      const sSum = wPure + wWhite;
      const s =
        sSum > 0
          ? Math.max(0, Math.min(100, Math.round((wPure / sSum) * 100)))
          : 0;

      const nextHex = hsvToHex(hsv.h, s, v);
      onChange?.(nextHex);
    },
    [getTriangleVertices, hsv.h, onChange],
  );

  const updateHueFromPoint = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - (rect.left + radius);
      const dy = clientY - (rect.top + radius);

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      const nextHex = hsvToHex(Math.round(angle), hsv.s, hsv.v);
      onChange?.(nextHex);
    },
    [hsv.s, hsv.v, onChange, radius],
  );

  const handlePointerDown = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = clientXToX(e.clientX, rect);
    const py = clientYToY(e.clientY, rect);

    const dist = Math.sqrt(
      (px - radius) * (px - radius) + (py - radius) * (py - radius),
    );

    if (dist >= innerRadius - 4 && dist <= radius + 6) {
      dragModeRef.current = "ring";
      updateHueFromPoint(e.clientX, e.clientY);
    } else {
      dragModeRef.current = "triangle";
      updateSVFromPoint(e.clientX, e.clientY);
    }

    const onPointerMove = (moveEvent) => {
      if (dragModeRef.current === "ring") {
        updateHueFromPoint(moveEvent.clientX, moveEvent.clientY);
      } else if (dragModeRef.current === "triangle") {
        updateSVFromPoint(moveEvent.clientX, moveEvent.clientY);
      }
    };

    const onPointerUp = () => {
      dragModeRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const clientXToX = (clientX, rect) => clientX - rect.left;
  const clientYToY = (clientY, rect) => clientY - rect.top;

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{ width: size, height: size }}
        className="cursor-crosshair select-none touch-none"
      />
    </div>
  );
}

ColorWheel.propTypes = {
  color: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  size: PropTypes.number,
};
