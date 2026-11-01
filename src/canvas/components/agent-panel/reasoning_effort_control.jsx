import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { BrainCircuit, Check, ChevronDown } from "lucide-react";

/** Compact model-specific reasoning selector for the Agent composer. */
export default function ReasoningEffortControl({
  efforts,
  value,
  onChange,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open || !efforts?.length) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [efforts?.length, open]);

  if (!efforts?.length) return null;

  const selectEffort = async (effort) => {
    setSaving(true);
    setError(false);
    try {
      await onChange(effort);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const label = (effort) =>
    effort ? t(`agent.reasoning.${effort}`) : t("agent.reasoning.default");

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-label={t("agent.reasoning.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("agent.reasoning.hint")}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 items-center gap-1 rounded-lg bg-white/[0.045] px-2 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.09] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/50"
      >
        <BrainCircuit size={13} aria-hidden="true" />
        <span>{label(value)}</span>
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("agent.reasoning.label")}
          className="absolute bottom-full right-0 z-30 mb-2 min-w-40 rounded-xl border border-white/[0.07] bg-[#171717] p-1.5 shadow-panel"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={value == null}
            disabled={saving}
            onClick={() => selectEffort(null)}
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <span>{label(null)}</span>
            {value == null && <Check size={13} aria-hidden="true" />}
          </button>
          {efforts.map((effort) => (
            <button
              key={effort}
              type="button"
              role="menuitemradio"
              aria-checked={value === effort}
              disabled={saving}
              onClick={() => selectEffort(effort)}
              className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
            >
              <span>{label(effort)}</span>
              {value === effort && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
          {error && (
            <p role="alert" className="px-2.5 pb-1 pt-2 text-[10px] text-rose-300">
              {t("agent.reasoning.saveFailed")}
            </p>
          )}
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
