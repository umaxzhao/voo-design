import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { BrainCircuit, Check, ChevronDown } from "lucide-react";

/** A compact, Codex-only advanced preference kept beside the model picker. */
export default function ReasoningEffortControl({ efforts, value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnKey);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, [open]);

  if (!efforts?.length) return null;
  const options = [null, ...efforts];
  const label = value ? t(`agent.reasoning.${value}`) : t("agent.reasoning.default");
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${t("agent.reasoning.label")}: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.1] hover:text-neutral-200"
      >
        <BrainCircuit size={13} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label={t("agent.reasoning.label")} className="absolute bottom-full right-0 z-20 mb-2 min-w-36 rounded-xl bg-[#1b1b1b] p-1 shadow-panel">
          {options.map((effort) => {
            const optionLabel = effort ? t(`agent.reasoning.${effort}`) : t("agent.reasoning.default");
            return (
              <button
                key={effort ?? "default"}
                type="button"
                role="menuitemradio"
                aria-checked={value === effort}
                onClick={async () => {
                  try {
                    await onChange(effort);
                    setSaveFailed(false);
                    setOpen(false);
                  } catch {
                    setSaveFailed(true);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              >
                <span className="flex-1">{optionLabel}</span>
                {value === effort && <Check size={13} aria-hidden="true" />}
              </button>
            );
          })}
          {saveFailed && <p role="alert" className="px-2.5 py-1.5 text-[10px] text-rose-300">{t("agent.reasoning.saveFailed")}</p>}
        </div>
      )}
    </div>
  );
}

ReasoningEffortControl.propTypes = {
  efforts: PropTypes.arrayOf(PropTypes.string),
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
