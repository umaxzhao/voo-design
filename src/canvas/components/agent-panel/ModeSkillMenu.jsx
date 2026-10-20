/**
 * ModeSkillMenu — the goal-mode tabs + per-mode skill list dropdown.
 *
 * Rendered as an overlay above the composer. Mode tabs switch the goal mode;
 * the list shows procedural skills — icon, title, description — each sending
 * its request on click. Pure presentational: all state lives in AgentPanel.
 */

import PropTypes from "prop-types";
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { IconEye, IconEyeOff, IconSparkles } from "../../icons.jsx";
import { skillIcon } from "./skill_icons.js";

/** Space kept between the popover and the composer / the panel's top edge. */
const POPOVER_GAP_PX = 8;
const PANEL_TOP_INSET_PX = 12;

/**
 * The popover's height cap: the real room between the composer and the top of
 * the agent panel. A viewport-based guess (100vh minus chrome) was right for
 * one window size and clipped the header — Import skill included — in others.
 */
function usePopoverMaxHeight(open) {
  const popoverRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const popover = popoverRef.current;
      const anchor = popover?.offsetParent;
      const panel = popover?.closest('[data-testid="agent-panel"]');
      if (!anchor || !panel) return;
      const room =
        anchor.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        POPOVER_GAP_PX -
        PANEL_TOP_INSET_PX;
      setMaxHeight(Math.max(0, Math.floor(room)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  return { popoverRef, maxHeight };
}

export default function ModeSkillMenu({
  open,
  modes,
  activeMode,
  modeSkills,
  onSelectMode,
  onSelectSkill,
  onToggleSkill,
  hiddenSkillIds,
  onImportSkillFile,
}) {
  const { t } = useI18n();
  const { popoverRef, maxHeight } = usePopoverMaxHeight(open);
  if (!open) return null;

  const renderItem = (skill) => {
    const hidden = hiddenSkillIds.has(skill.id);
    const SkillIcon = skillIcon(skill);
    const title = skill.labelKey ? t(skill.labelKey) : skill.name;
    const description = skill.descKey ? t(skill.descKey) : skill.description;
    return (
      <li
        key={skill.id}
        className={`group flex items-center gap-1 rounded-xl p-1.5 transition-colors ${
          hidden ? "bg-white/[0.02]" : "bg-white/[0.04] hover:bg-white/[0.08]"
        }`}
      >
        <button
          type="button"
          disabled={hidden}
          onClick={() => onSelectSkill(skill)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left disabled:cursor-default"
        >
          <span className={hidden ? "text-neutral-500" : "text-neutral-300"}>
            <SkillIcon size={16} strokeWidth={1.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[12px] ${
                hidden ? "text-neutral-500" : "text-neutral-100"
              }`}
            >
              {title}
            </span>
            {description && (
              <span
                className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${
                  hidden ? "text-neutral-500" : "text-neutral-400"
                }`}
              >
                {description}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onToggleSkill(skill)}
          aria-pressed={!hidden}
          aria-label={t("agent.skillVisibility")}
          title={t("agent.skillVisibility")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
        >
          {hidden ? <IconEyeOff size={12} /> : <IconEye size={12} />}
        </button>
      </li>
    );
  };

  return (
    // Grows upward from the composer, capped to the measured room so the tabs
    // and header stay inside the panel; the list takes what is left. The
    // class cap only covers the first paint, before the measurement lands.
    <div
      ref={popoverRef}
      style={maxHeight == null ? undefined : { maxHeight }}
      className="absolute bottom-[calc(100%+8px)] inset-x-0 z-50 flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-2xl bg-neutral-900 p-3 shadow-menu border border-white/10 backdrop-blur-xl"
    >
      {/* Goal Mode Tabs — one row */}
      <div className="flex shrink-0 items-center gap-1 pb-2.5 mb-2.5 border-b border-white/10">
        {modes.map((mode) => {
          const TabIcon = mode.Icon;
          const active = mode.id === activeMode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelectMode(mode.id)}
              className={`flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <TabIcon size={12} className="shrink-0" />
              <span className="truncate">{t(mode.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex shrink-0 items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 font-semibold">
          {t("agent.skillPanelTitle")}
        </span>
        {onImportSkillFile && (
          <button
            type="button"
            onClick={onImportSkillFile}
            title={t("agent.skillImport")}
            aria-label={t("agent.skillImport")}
            className="flex h-6 items-center gap-1 rounded-lg bg-white/[0.06] px-2 text-[10px] font-medium text-neutral-300 hover:bg-white/[0.12] hover:text-white transition-colors"
          >
            <IconSparkles size={11} />
            <span>{t("agent.skillImport")}</span>
          </button>
        )}
      </div>

      <div className="h-[520px] min-h-0 shrink overflow-y-auto ui-scroll pr-1">
        {modeSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
            <p className="text-[11px] text-neutral-400">
              {t("agent.skillEmpty")}
            </p>
            {onImportSkillFile && (
              <button
                type="button"
                onClick={onImportSkillFile}
                className="text-[11px] text-[#eed0ff] hover:underline"
              >
                {t("agent.skillImportAction")}
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {modeSkills.map(renderItem)}
          </ul>
        )}
      </div>
    </div>
  );
}

ModeSkillMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  modes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      labelKey: PropTypes.string.isRequired,
      Icon: PropTypes.func.isRequired,
    }),
  ).isRequired,
  activeMode: PropTypes.shape({
    id: PropTypes.string.isRequired,
    labelKey: PropTypes.string.isRequired,
    Icon: PropTypes.func.isRequired,
  }).isRequired,
  modeSkills: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      labelKey: PropTypes.string,
      descKey: PropTypes.string,
      promptKey: PropTypes.string,
      name: PropTypes.string,
      description: PropTypes.string,
      source: PropTypes.string,
    }),
  ).isRequired,
  onSelectMode: PropTypes.func.isRequired,
  onSelectSkill: PropTypes.func.isRequired,
  onToggleSkill: PropTypes.func.isRequired,
  hiddenSkillIds: PropTypes.instanceOf(Set).isRequired,
  onImportSkillFile: PropTypes.func,
};
