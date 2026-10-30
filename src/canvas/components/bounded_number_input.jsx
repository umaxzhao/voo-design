import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createEditorGestureTransaction } from "../../shared/editor-gesture-transaction.js";

const NUMBER_INPUT_GESTURE_KEY = "bounded-number-input";

/** Number input that validates on commit without blocking multi-digit typing. */
export default function BoundedNumberInput({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onCommit = undefined,
  className = undefined,
  ariaLabel,
  inputRef = undefined,
  disabled = false,
  precision = 0,
}) {
  const [draft, setDraft] = useState(String(value));
  const draftRef = useRef(String(value));
  const focusedRef = useRef(false);
  const committedValueRef = useRef(value);
  const emittedValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const transactionRef = useRef(null);

  onCommitRef.current = onCommit;
  if (!transactionRef.current) {
    transactionRef.current = createEditorGestureTransaction({
      onCommit: () => onCommitRef.current?.(),
    });
  }

  useEffect(() => {
    if (!focusedRef.current) {
      const nextDraft = String(value);
      committedValueRef.current = value;
      emittedValueRef.current = value;
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
  }, [value]);

  // Integer fields keep the original `Math.round`; decimal fields opt in with
  // `precision` so line-height/letter-spacing can be typed instead of only
  // scrubbed (0.05 / 0.5 steps previously snapped to whole numbers).
  const roundToPrecision = (rawValue) => {
    const factor = 10 ** precision;
    return Math.round(rawValue * factor) / factor;
  };

  const normalize = (rawValue) => {
    const parsed = Number(rawValue);
    const safeValue = Number.isFinite(parsed) ? parsed : value;
    return Math.min(max, Math.max(min, roundToPrecision(safeValue)));
  };

  const emitValue = (nextValue) => {
    if (nextValue === emittedValueRef.current) return false;
    emittedValueRef.current = nextValue;
    onValueChange(nextValue);
    return true;
  };

  const commit = () => {
    const nextValue = normalize(draftRef.current);
    const nextDraft = String(nextValue);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    const transaction = transactionRef.current;
    transaction.begin(NUMBER_INPUT_GESTURE_KEY);
    const changed = nextValue !== committedValueRef.current;
    transaction.setChanged(NUMBER_INPUT_GESTURE_KEY, changed);
    if (changed) emitValue(nextValue);
    committedValueRef.current = nextValue;
    // The interaction ended (blur, Enter or arrow): a changed value lands one
    // snapshot; a focus-only or reverted gesture lands none.
    return transaction.commit(NUMBER_INPUT_GESTURE_KEY);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      ref={inputRef}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      className={className}
      onFocus={() => {
        focusedRef.current = true;
        transactionRef.current.begin(NUMBER_INPUT_GESTURE_KEY);
      }}
      onChange={(event) => {
        transactionRef.current.begin(NUMBER_INPUT_GESTURE_KEY);
        const nextDraft = event.target.value;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        const parsed = Number(nextDraft);
        if (
          nextDraft !== "" &&
          Number.isFinite(parsed) &&
          parsed >= min &&
          parsed <= max
        ) {
          emitValue(roundToPrecision(parsed));
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          // Typing previews geometry live. Cancel must restore the value at
          // the last committed boundary before blur can commit the draft.
          const previousValue = committedValueRef.current;
          const previousDraft = String(previousValue);
          draftRef.current = previousDraft;
          setDraft(previousDraft);
          emitValue(previousValue);
          transactionRef.current.cancel(NUMBER_INPUT_GESTURE_KEY);
          event.currentTarget.blur();
          return;
        }
        // Plain arrows are the native number-input behaviour; Shift coarsens
        // to ±10×step, mirroring the scrub modifier.
        if (
          event.shiftKey &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
          const nextValue = Math.min(
            max,
            Math.max(min, roundToPrecision(normalize(draftRef.current) + direction * 10 * step)),
          );
          const nextDraft = String(nextValue);
          draftRef.current = nextDraft;
          setDraft(nextDraft);
          emitValue(nextValue);
          commit();
        }
      }}
      onKeyUp={(event) => {
        event.stopPropagation();
        // Plain arrow keys drive the native number input; commit when the
        // keypress lands so keyboard edits snap history too.
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          commit();
        }
      }}
    />
  );
}

BoundedNumberInput.propTypes = {
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  onValueChange: PropTypes.func.isRequired,
  /** Called when an interaction ends (blur, Enter, arrow step). */
  onCommit: PropTypes.func,
  className: PropTypes.string,
  ariaLabel: PropTypes.string.isRequired,
  inputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  disabled: PropTypes.bool,
  /** Decimal places kept when committing. 0 (default) keeps integer fields. */
  precision: PropTypes.number,
};
