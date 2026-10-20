import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { DESIGN_SYSTEMS } from "../../design_systems.js";
import {
  IconCheck,
  IconChevronDown,
  IconLayout,
  ICON_STROKE_WIDTH,
} from "../../icons.jsx";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { useI18n } from "../../use_i18n.js";

/** Compact pill trigger + popover menu shared by the Workflow and Design Editor agent views. */
export default function DesignSystemSelect({ disabled = false }) {
  const { t } = useI18n();
  const selected = useWorkflowStore((state) => state.agentDesignSystem);
  const setSelected = useWorkflowStore((state) => state.setAgentDesignSystem);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentLabel =
    !selected || selected === "auto"
      ? t("designSystem.auto")
      : t(DESIGN_SYSTEMS[selected]?.labelKey || "designSystem.auto");

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id="agent-design-system-trigger"
        data-testid="agent-design-system-trigger"
        aria-label={t("designSystem.label")}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          isOpen
            ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
            : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.1] hover:text-white"
        }`}
      >
        <IconLayout size={12} strokeWidth={ICON_STROKE_WIDTH} />
        <span className="max-w-[70px] truncate">{currentLabel}</span>
        <IconChevronDown size={11} className="shrink-0 text-neutral-500" />
      </button>

      {/* Accessible native select fallback for testing & screen readers */}
      <select
        id="agent-design-system"
        value={selected ?? "auto"}
        onChange={(event) => setSelected(event.target.value)}
        disabled={disabled}
        aria-label={t("designSystem.label")}
        className="sr-only"
        tabIndex={-1}
      >
        <option value="auto">{t("designSystem.auto")}</option>
        {Object.values(DESIGN_SYSTEMS).map((system) => (
          <option key={system.id} value={system.id}>
            {t(system.labelKey)}
          </option>
        ))}
      </select>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("designSystem.label")}
          data-testid="agent-design-system-menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-44 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-menu backdrop-blur-xl"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            {t("designSystem.label")}
          </div>
          <button
            type="button"
            role="menuitem"
            data-testid="design-system-option-auto"
            onClick={() => {
              setSelected("auto");
              setIsOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
              (selected ?? "auto") === "auto"
                ? "bg-white/[0.1] font-medium text-white"
                : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <span>{t("designSystem.auto")}</span>
            {(selected ?? "auto") === "auto" && (
              <IconCheck
                size={12}
                strokeWidth={ICON_STROKE_WIDTH}
                className="text-[#a7ffd4]"
              />
            )}
          </button>
          {Object.values(DESIGN_SYSTEMS).map((system) => {
            const isSelected = selected === system.id;
            return (
              <button
                key={system.id}
                type="button"
                role="menuitem"
                data-testid={`design-system-option-${system.id}`}
                onClick={() => {
                  setSelected(system.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
                  isSelected
                    ? "bg-white/[0.1] font-medium text-white"
                    : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span>{t(system.labelKey)}</span>
                {isSelected && (
                  <IconCheck
                    size={12}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="text-[#a7ffd4]"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

DesignSystemSelect.propTypes = {
  disabled: PropTypes.bool,
};
