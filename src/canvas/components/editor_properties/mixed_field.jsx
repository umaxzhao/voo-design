import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { evaluateMathExpression } from "../bounded_number_input.jsx";
import { useScrubDrag } from "../use_scrub_drag.js";

/**
 * A field for a property whose multi-selection disagrees.
 *
 * In Figma, mixed multi-selections show "Mixed". Typing a value or math
 * expression applies it to every selected layer. Dragging the prefix scrubs
 * the value, and arrow keys increment/decrement (Shift x 10).
 */
export default function MixedField({
  label,
  suffix = "",
  bare = false,
  onValueChange = undefined,
  min = undefined,
  max = undefined,
  step = 1,
  precision = 0,
  ariaLabel = undefined,
  commitNow = undefined,
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const editable = typeof onValueChange === "function";

  const scrub = useScrubDrag({
    value: 0,
    step,
    min,
    max,
    onScrub: (val) => {
      if (editable) onValueChange(val);
    },
    onScrubEnd: () => {
      commitNow?.();
    },
  });

  const commit = () => {
    if (!editable) return;
    const text = draft.trim();
    setDraft("");
    if (!text) return;
    const parsed = evaluateMathExpression(text);
    if (!Number.isFinite(parsed)) return;
    let next = precision > 0
      ? Math.round(parsed * 10 ** precision) / 10 ** precision
      : Math.round(parsed);
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    onValueChange(next);
    commitNow?.();
  };

  const placeholderText = suffix ? `Mixed ${suffix}` : "Mixed";

  return (
    <div
      data-inspector-control={bare ? "bare-field" : "field"}
      className={`flex min-w-0 items-center rounded-xl bg-neutral-800 px-2.5 h-7 text-[11px] font-mono text-neutral-400 transition-colors hover:bg-neutral-800/80 focus-within:bg-neutral-700 ${
        bare ? "flex-1" : ""
      }`}
      title={editable ? t("editor.props.mixedValuesEditable") : t("editor.props.mixedValues")}
    >
      <span
        data-inspector-part="label"
        aria-hidden="true"
        tabIndex={-1}
        {...(editable ? scrub : {})}
        className="inline-flex shrink-0 cursor-ew-resize touch-none select-none pr-1.5 text-[10px] font-mono uppercase tracking-wide text-neutral-400 transition-colors hover:text-neutral-200"
      >
        {label}
      </span>
      {editable ? (
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={placeholderText}
          aria-label={ariaLabel || (typeof label === "string" ? label : "Mixed")}
          title={t("editor.props.mixedValuesEditable")}
          onFocus={(event) => event.target.select?.()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              commit();
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              setDraft("");
              event.currentTarget.blur();
              return;
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const mult = event.shiftKey ? 10 : 1;
              const dir = event.key === "ArrowUp" ? 1 : -1;
              const cur = evaluateMathExpression(draft) || 0;
              let next = cur + dir * mult * step;
              if (Number.isFinite(min)) next = Math.max(min, next);
              if (Number.isFinite(max)) next = Math.min(max, next);
              if (precision > 0) next = Math.round(next * 10 ** precision) / 10 ** precision;
              setDraft(String(next));
              onValueChange(next);
              commitNow?.();
            }
          }}
          onKeyUp={(event) => event.stopPropagation()}
          className="ml-auto w-full min-w-0 bg-transparent text-right text-[11px] font-mono tabular-nums text-neutral-200 outline-none placeholder:text-neutral-400 placeholder:italic cursor-text"
        />
      ) : (
        <span className="ml-auto text-neutral-400 italic">{placeholderText}</span>
      )}
      {suffix ? <span className="sr-only" aria-hidden="true">—{suffix}</span> : null}
    </div>
  );
}

MixedField.propTypes = {
  label: PropTypes.node.isRequired,
  suffix: PropTypes.string,
  bare: PropTypes.bool,
  onValueChange: PropTypes.func,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  precision: PropTypes.number,
  ariaLabel: PropTypes.string,
  commitNow: PropTypes.func,
};
