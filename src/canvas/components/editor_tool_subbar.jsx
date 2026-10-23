import PropTypes from "prop-types";
import { useLayoutEffect, useRef, useState } from "react";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import { useI18n } from "../use_i18n.js";
import { toolFamilyIcon } from "./tool_family_icons.jsx";
export default function EditorToolSubbar({
  activeFamilyId,
  tool,
  onTool,
  marqueeMode = "region",
  onMarqueeMode,
  brushMode = "normal",
  onBrushMode,
  healingMode = "aiRepair",
  onHealingMode,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState({ left: null, top: null });
  const subbarRef = useRef(null);

  const family = activeFamilyId ? TOOL_FAMILIES[activeFamilyId] : null;

  // Measure the rendered menu so adding modes cannot push it off-screen.
  useLayoutEffect(() => {
    if (!activeFamilyId) {
      setPos({ left: null, top: null });
      return;
    }

    const anchorEl = document.querySelector(
      `[data-family-id="${activeFamilyId}"]`,
    );
    const menuEl = subbarRef.current;
    if (!anchorEl || !menuEl) return;

    const anchor = anchorEl.getBoundingClientRect();
    const menu = menuEl.getBoundingClientRect();
    const padding = 8;
    const gap = 4;
    const maxLeft = Math.max(padding, window.innerWidth - menu.width - padding);
    const below = anchor.bottom + gap;
    const above = anchor.top - gap - menu.height;
    setPos({
      left: Math.max(padding, Math.min(anchor.left, maxLeft)),
      top:
        below + menu.height <= window.innerHeight - padding
          ? below
          : Math.max(padding, above),
    });
  }, [activeFamilyId, family?.items.length]);

  if (!activeFamilyId || !family) return null;

  return (
    <div
      ref={subbarRef}
      data-testid="editor-tool-subbar"
      style={{
        left: pos.left !== null ? `${pos.left}px` : "50%",
        top: pos.top !== null ? `${pos.top}px` : "58px",
        transform: pos.left !== null ? "none" : "translateX(-50%)",
      }}
      className="fixed z-30 animate-in fade-in zoom-in-95 duration-100 select-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex max-h-[calc(100vh-1rem)] min-w-[142px] flex-col gap-0.5 overflow-y-auto rounded-xl border border-white/10 bg-black/90 p-1 font-mono shadow-panel backdrop-blur-md select-none">
        {family.items
          .filter(
            (item) => activeFamilyId !== "marquee" || item.id !== "region",
          )
          .map((item) => {
            const active = family.isActiveItem(item, {
              tool,
              marqueeMode,
              brushMode,
              healingMode,
            });
            const isAi = Boolean(item.isAi);
            const Icon = toolFamilyIcon(item.icon);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  family.applyItem(item, {
                    tool,
                    onTool,
                    onMarqueeMode,
                    onBrushMode,
                    onHealingMode,
                  });
                  // A chosen mode ends the hover interaction immediately. The
                  // bridge delay only exists while travelling into this menu;
                  // keeping it alive afterwards can intercept the next canvas
                  // pointerdown when the menu grows.
                  onSelect?.();
                }}
                aria-label={t(item.labelKey)}
                aria-pressed={active}
                className={`group flex items-center justify-between gap-2.5 rounded-lg px-2 py-1 text-left text-[11px] transition-all ${
                  active
                    ? isAi
                      ? "bg-[#E5B2FF] text-black font-medium"
                      : "bg-white text-black font-medium"
                    : isAi
                      ? "text-[#eed0ff] hover:bg-[#E5B2FF]/15 hover:text-[#E5B2FF]"
                      : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {/* Left: Icon and Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg ${
                      active
                        ? isAi
                          ? "text-black"
                          : "text-black"
                        : isAi
                          ? "text-neutral-300"
                          : "text-neutral-400 group-hover:text-white"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="truncate leading-none">
                    {t(item.labelKey)}
                  </span>
                </div>

                {/* Right: Shortcut / AI pill badge */}
                <div className="flex items-center gap-1 shrink-0">
                  {isAi ? (
                    <span
                      className={`rounded-lg px-1 py-0.2 text-[9px] font-medium leading-none ${
                        active
                          ? "bg-black/20 text-black"
                          : "bg-[#E5B2FF]/15 text-[#eed0ff]"
                      }`}
                    >
                      AI
                    </span>
                  ) : null}
                  {item.shortcut ? (
                    <span
                      className={`text-[9px] tabular-nums leading-none ${
                        active
                          ? "text-black/70"
                          : "text-neutral-400 group-hover:text-neutral-300"
                      }`}
                    >
                      {item.shortcut}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

EditorToolSubbar.propTypes = {
  activeFamilyId: PropTypes.string,
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  marqueeMode: PropTypes.string,
  onMarqueeMode: PropTypes.func,
  brushMode: PropTypes.string,
  onBrushMode: PropTypes.func,
  healingMode: PropTypes.string,
  onHealingMode: PropTypes.func,
  onSelect: PropTypes.func,
  onMouseEnter: PropTypes.func,
  onMouseLeave: PropTypes.func,
};
