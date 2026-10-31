import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openAgentModelSettings } from "./model-settings.js";
import PropTypes from "prop-types";
import { Check } from "lucide-react";
import { ProviderLogo } from "../provider_icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { getModelDisplayParts } from "./model_catalog.js";

const useMenuMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A bottom-anchored picker: only provider headings and selectable models. */
export default function AgentModelMenu({
  currentModel,
  groups,
  onSelect,
  onClose,
  triggerRef,
  composerRef,
}) {
  const { t } = useI18n();
  const menuRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(420);

  useMenuMeasureEffect(() => {
    const menu = menuRef.current;
    const composer = composerRef.current;
    const panel = composer.closest("section");
    // Measure the actual panel so short windows never clip the first models.
    const measure = () => {
      const top = Math.max(0, panel.getBoundingClientRect().top);
      setMaxHeight(
        Math.min(
          420,
          Math.max(0, composer.getBoundingClientRect().top - top - 12),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(composer);
    window.addEventListener("resize", measure);
    measure();

    const selected =
      menu.querySelector('[aria-checked="true"]') ??
      menu.querySelector("button");
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest" });
    const dismiss = (event) => {
      if (
        !menu.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      )
        onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [composerRef, triggerRef, onClose]);

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = [
      ...menuRef.current.querySelectorAll('[role="menuitemradio"], [role="menuitem"]'),
    ];
    const index = options.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length;
    options[next]?.focus();
  };

  return (
    <div
      ref={menuRef}
      id="agent-model-menu"
      data-testid="agent-model-menu"
      role="menu"
      aria-label={t("agent.panel.selectModel")}
      onKeyDown={onKeyDown}
      style={{ maxHeight }}
      className="absolute inset-x-0 bottom-full z-20 mb-2 flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#171717] p-2.5 shadow-panel"
    >
      {!groups.some(group => group.models.length) && (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-xs text-neutral-400">{t("settings.agent.noModelsConnected")}</p>
          <button type="button" role="menuitem" onClick={() => { onClose(); openAgentModelSettings(); }}
            className="min-h-12 rounded-xl bg-white/[0.08] px-3 text-left text-xs text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40">
            {t("agent.connection.configureApi")}
          </button>
        </div>
      )}
      {groups.map((group) => (
        <div
          key={group.cliId}
          role="group"
          aria-label={group.name}
          className="flex flex-col gap-0.5"
        >
          <div className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-[11px] font-medium text-neutral-400">
            <ProviderLogo
              providerId={
                getModelDisplayParts(group.models[0]?.id, groups).providerId ??
                group.cliId
              }
              size={13}
            />
            <span className="truncate">{group.name}</span>
          </div>
          {group.models.map((model) => {
            const selected = currentModel === model.id;
            const parts = getModelDisplayParts(model.id, groups);
            return (
              <button
                key={model.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                data-testid={`model-option-${model.id}`}
                onClick={() => {
                  onSelect(model.id);
                  triggerRef.current?.focus();
                }}
                className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#E5B2FF] ${selected ? "bg-[#E5B2FF]/15 font-medium text-[#eed0ff]" : "text-neutral-300"}`}
              >
                <span className="truncate">
                  {parts.modelName}
                  {parts.tier}
                </span>
                {selected && (
                  <Check
                    size={13}
                    className="ml-2 shrink-0 text-neutral-300"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

AgentModelMenu.propTypes = {
  currentModel: PropTypes.string,
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      cliId: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      models: PropTypes.arrayOf(
        PropTypes.shape({ id: PropTypes.string.isRequired }),
      ).isRequired,
    }),
  ).isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  triggerRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  composerRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
};
