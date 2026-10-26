import PropTypes from "prop-types";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useI18n } from "../use_i18n.js";
import { PIE_DEFAULT_ITEM_BY_CODE } from "../editor/tool_families.js";
import { toolFamilyIcon } from "./tool_family_icons.jsx";

/**
 * Radial Pie Menu that displays tool family choices around the mouse cursor
 * when a family shortcut key is held down (e.g. M or A for selection family).
 * Moving the mouse over any icon highlights it.
 * When releasing the key (or clicking), whichever icon was hovered/last hovered is chosen.
 * Design: Flat, zero borders, zero drop shadows, text-[9px], semi-transparent backdrop.
 * Labels dynamically position outwards (top/bottom/left/right) based on sector angle.
 */
export default function EditorPieMenu({
  family,
  triggerCode = null,
  position,
  tool,
  marqueeMode = "rect",
  brushMode = "normal",
  healingMode = "aiRepair",
  onTool,
  onMarqueeMode,
  onBrushMode,
  onHealingMode,
  onClose,
}) {
  const { t } = useI18n();
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const containerRef = useRef(null);
  // Anchor position on mount: pie menu must never move after opening
  const anchorPositionRef = useRef(position);
  const menuPos = anchorPositionRef.current;

  // Every family member takes a slice of the radial, including Object select
  // (region): it is the tool the marquee chevron and the Z key name, so hiding
  // it here left the pie unable to reach it.
  const items = family.items;
  const count = items.length;
  const radius = 72; // Distance from center to icon center
  const innerRadius = 8; // Responsive dead zone radius around cursor (reduced from 14 for instant flick detection)
  const outerRadius = 110; // Outer trigger boundary

  // Find currently active item index in the family
  const activeIndex = useMemo(() => {
    return items.findIndex((item) =>
      family.isActiveItem(item, { tool, marqueeMode, brushMode, healingMode }),
    );
  }, [items, family, tool, marqueeMode, brushMode, healingMode]);

  // Releasing the key without moving the pointer picks the member the pressed
  // key names (W → Wand, Z → Object select), not simply the first sector.
  const defaultIndex = useMemo(() => {
    const preferredId = triggerCode
      ? PIE_DEFAULT_ITEM_BY_CODE[triggerCode]
      : null;
    if (!preferredId) return 0;
    const index = items.findIndex(
      (item) => item.id === preferredId || item.toolId === preferredId,
    );
    return index >= 0 ? index : 0;
  }, [items, triggerCode]);

  // Track the last hovered valid item index
  const lastHoveredIndexRef = useRef(activeIndex >= 0 ? activeIndex : defaultIndex);

  // Handle pointer tracking to find which radial sector is hovered
  const handlePointerMove = useCallback(
    (e) => {
      const dx = e.clientX - menuPos.x;
      const dy = e.clientY - menuPos.y;
      const distance = Math.hypot(dx, dy);

      if (distance < innerRadius) {
        return;
      }

      // Angle in radians [-PI, PI], 0 is right, -PI/2 is top
      let angle = Math.atan2(dy, dx);
      // Offset so the 0th item starts at top (-PI/2)
      // Normalized angle in [0, 2*PI)
      let normAngle = angle + Math.PI / 2 + Math.PI / count;
      while (normAngle < 0) normAngle += Math.PI * 2;
      while (normAngle >= Math.PI * 2) normAngle -= Math.PI * 2;

      const sectorSize = (Math.PI * 2) / count;
      const idx = Math.floor(normAngle / sectorSize) % count;
      setHoveredIndex(idx);
      lastHoveredIndexRef.current = idx;
    },
    [menuPos.x, menuPos.y, innerRadius, count],
  );

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
    };
  }, [handlePointerMove]);

  const selectItem = useCallback(
    (idx) => {
      const targetItem = items[idx];
      if (targetItem) {
        family.applyItem(targetItem, {
          tool,
          onTool,
          onMarqueeMode,
          onBrushMode,
          onHealingMode,
        });
      }
      onClose();
    },
    [
      items,
      family,
      tool,
      onTool,
      onMarqueeMode,
      onBrushMode,
      onHealingMode,
      onClose,
    ],
  );

  const selectItemRef = useRef(selectItem);
  selectItemRef.current = selectItem;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Listen for keyup to confirm selection of the icon when releasing the key, or Escape to dismiss
  useEffect(() => {
    const handleKeyUp = (e) => {
      const matchingCodes = family.codes || [family.code];
      if (
        matchingCodes.includes(e.code) ||
        (triggerCode && e.code === triggerCode)
      ) {
        e.preventDefault();
        e.stopPropagation();
        const targetIdx =
          hoveredIndex >= 0
            ? hoveredIndex
            : lastHoveredIndexRef.current >= 0
              ? lastHoveredIndexRef.current
              : activeIndex >= 0
                ? activeIndex
                : defaultIndex;
        selectItemRef.current(targetIdx);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [
    family.code,
    family.codes,
    triggerCode,
    hoveredIndex,
    activeIndex,
    defaultIndex,
  ]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 pointer-events-auto select-none"
      onPointerDown={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Centered Pie Container */}
      <div
        role="menu"
        aria-label={t("editor.toolbar.label")}
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: menuPos.x,
          top: menuPos.y,
          width: outerRadius * 2,
          height: outerRadius * 2,
        }}
      >
        {/* One glass ring groups every icon; the middle stays clear so the
            canvas and centre dot remain readable. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full backdrop-blur-md"
          style={{
            width: (outerRadius + 16) * 2,
            height: (outerRadius + 16) * 2,
            background:
              "radial-gradient(circle, transparent 0 45%, rgba(0,0,0,0.62) 45% 93%, rgba(255,255,255,0.12) 93% 100%)",
          }}
        />

        {/* Center indicator dot */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-white/60" />
        </div>

        {/* Render items around the circle */}
        {items.map((item, idx) => {
          // Angle for each item (starting from top -PI/2)
          const itemAngle = -Math.PI / 2 + (idx * 2 * Math.PI) / count;
          const itemX = outerRadius + radius * Math.cos(itemAngle);
          const itemY = outerRadius + radius * Math.sin(itemAngle);

          const isHovered = hoveredIndex === idx;
          const isLastHovered =
            hoveredIndex < 0 && lastHoveredIndexRef.current === idx;
          const isHighlighted = isHovered || isLastHovered;
          const isActive = activeIndex === idx;
          const Icon = toolFamilyIcon(item.icon);

          // Determine label placement relative to the icon based on angle:
          // cosAngle: > 0.4 => Right, < -0.4 => Left
          // sinAngle: > 0.4 => Bottom, < -0.4 => Top
          const cos = Math.cos(itemAngle);
          const sin = Math.sin(itemAngle);

          let labelPosClass = "top-full left-1/2 -translate-x-1/2 mt-1"; // default bottom
          if (sin < -0.55) {
            // Top sector -> label above icon
            labelPosClass = "bottom-full left-1/2 -translate-x-1/2 mb-1";
          } else if (sin > 0.55) {
            // Bottom sector -> label below icon
            labelPosClass = "top-full left-1/2 -translate-x-1/2 mt-1";
          } else if (cos > 0.5) {
            // Right sector -> label to the right of icon
            labelPosClass = "left-full top-1/2 -translate-y-1/2 ml-1.5";
          } else if (cos < -0.5) {
            // Left sector -> label to the left of icon
            labelPosClass = "right-full top-1/2 -translate-y-1/2 mr-1.5";
          }

          return (
            <div
              key={item.id}
              role="menuitem"
              tabIndex={0}
              aria-label={t(item.labelKey)}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-transform duration-100 flex items-center justify-center cursor-pointer"
              style={{
                left: itemX,
                top: itemY,
                transform: `translate(-50%, -50%) scale(${isHighlighted ? 1.15 : 1})`,
              }}
              onPointerEnter={() => {
                setHoveredIndex(idx);
                lastHoveredIndexRef.current = idx;
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectItem(idx);
              }}
            >
              {/* Icon Circle (Flat, zero border, zero shadow) */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-all ${
                  isHighlighted
                    ? "bg-white text-black font-medium"
                    : isActive
                      ? "bg-white/30 text-white"
                      : "bg-black/60 text-neutral-300 hover:bg-white/20 hover:text-white"
                }`}
              >
                <Icon size={16} />
              </div>

              {/* Dynamic Directional Label with semi-transparent background */}
              <div
                className={`absolute ${labelPosClass} whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[9px] tracking-tight backdrop-blur-md transition-all pointer-events-none ${
                  isHighlighted
                    ? "bg-white text-black font-medium opacity-100"
                    : "bg-black/60 text-neutral-200 opacity-90"
                }`}
              >
                {t(item.labelKey)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

EditorPieMenu.propTypes = {
  family: PropTypes.object.isRequired,
  triggerCode: PropTypes.string,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
  tool: PropTypes.string.isRequired,
  marqueeMode: PropTypes.string,
  brushMode: PropTypes.string,
  healingMode: PropTypes.string,
  onTool: PropTypes.func.isRequired,
  onMarqueeMode: PropTypes.func,
  onBrushMode: PropTypes.func,
  onHealingMode: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
