import PropTypes from "prop-types";
import { AI_GEN_TYPES } from "./welcome_constants.js";

function TypePreview({ type }) {
  const canvasClass = "flex shrink-0 overflow-hidden rounded-md bg-neutral-800 p-1";
  const blockClass = "rounded-md bg-neutral-500/70";

  if (type === "mobile") {
    return (
      <span aria-hidden="true" className="flex h-8 w-[18px] rounded-md bg-neutral-300 p-[2px]">
        <span className="flex min-h-0 flex-1 flex-col gap-[2px] rounded-md bg-neutral-900 p-[2px]">
          <span className="h-1 w-2 rounded-full bg-mint/80" />
          <span className="h-2 rounded-md bg-neutral-600" />
          <span className="h-1 rounded-full bg-neutral-400/60" />
        </span>
      </span>
    );
  }

  if (type === "storyboard") {
    return (
      <span aria-hidden="true" className="flex h-7 w-12 gap-[2px]">
        <span className="flex-1 rounded-md bg-neutral-600"><span className="mt-2 block h-2 bg-mint/60" /></span>
        <span className="flex-1 rounded-md bg-neutral-500"><span className="mt-1 block h-3 bg-neutral-700" /></span>
        <span className="flex-1 rounded-md bg-neutral-600"><span className="mt-2 block h-2 bg-neutral-300/70" /></span>
      </span>
    );
  }

  if (type === "poster") {
    return (
      <span aria-hidden="true" className={`${canvasClass} h-8 w-6 flex-col justify-between`}>
        <span className="h-1 w-3 rounded-full bg-neutral-300" />
        <span className="h-3 w-full rounded-md bg-mint/80" />
        <span className="h-1 w-4 rounded-full bg-neutral-400/70" />
      </span>
    );
  }

  if (type === "slides") {
    return (
      <span aria-hidden="true" className={`${canvasClass} h-7 w-12 items-end gap-1`}>
        <span className="mb-auto mt-0.5 h-1 w-4 rounded-full bg-neutral-300" />
        <span className="h-2 w-1.5 rounded-t-md bg-mint/60" />
        <span className="h-3 w-1.5 rounded-t-md bg-mint/80" />
        <span className="h-4 w-1.5 rounded-t-md bg-mint" />
      </span>
    );
  }

  if (type === "dashboard") {
    return (
      <span aria-hidden="true" className={`${canvasClass} h-7 w-12 gap-[3px]`}>
        <span className="w-2 rounded-md bg-mint/70" />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="flex h-2 gap-[2px]"><span className="flex-1 rounded-md bg-neutral-500" /><span className="flex-1 rounded-md bg-neutral-600" /></span>
          <span className="flex flex-1 items-end gap-[2px] rounded-md bg-neutral-700 px-1 py-[2px]">
            <span className="h-1/2 flex-1 rounded-t-md bg-mint/50" /><span className="h-full flex-1 rounded-t-md bg-mint" /><span className="h-2/3 flex-1 rounded-t-md bg-mint/70" />
          </span>
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`${canvasClass} h-7 w-12 gap-[3px]`}>
      {type === "landing" ? <span className="w-2 rounded-md bg-neutral-600" /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="h-1 w-full rounded-full bg-mint/70" />
        <span className={`h-2 ${blockClass}`} />
        <span className="flex flex-1 gap-[2px]"><span className="flex-1 rounded-md bg-neutral-500/50" /><span className="flex-1 rounded-md bg-neutral-600" /></span>
      </span>
    </span>
  );
}

TypePreview.propTypes = { type: PropTypes.string.isRequired };

export default function WelcomePromptTypes({ t, activePill, onSelectPill }) {
  const selectedId = AI_GEN_TYPES.some(item => item.id === activePill) ? activePill : AI_GEN_TYPES[0].id;
  const navigate = (event, index) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const offsets = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = AI_GEN_TYPES.length - 1;
    else if (offsets[event.key]) next = (index + offsets[event.key] + AI_GEN_TYPES.length) % AI_GEN_TYPES.length;
    else return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = event.currentTarget.parentElement.querySelectorAll('[role="radio"]');
    onSelectPill?.(AI_GEN_TYPES[next].id);
    buttons[next]?.focus();
  };
  return (
    <>
      <div
        className="welcome-prompt-type-options mb-4 flex flex-wrap items-center justify-center gap-1.5"
        role="radiogroup"
        aria-label={t("welcome.prompt.generationTypeLabel")}
      >
        {AI_GEN_TYPES.map((typeItem, index) => {
          const isSelected = selectedId === typeItem.id;
          return (
            <button
              key={typeItem.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={event => navigate(event, index)}
              onClick={() => onSelectPill?.(typeItem.id)}
              className={`flex min-w-[4.75rem] flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-colors cursor-pointer select-none ${
                isSelected
                  ? "bg-white/10 text-white"
                  : "bg-transparent text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
              }`}
            >
              <TypePreview type={typeItem.preview} />
              <span className="whitespace-nowrap">{t(typeItem.label)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
WelcomePromptTypes.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func,
};
