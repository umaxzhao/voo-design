import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";

/** Single-line counterpart to ImeTextarea, buffered until IME composition ends. */
export default function ImeInput({
  value,
  onValueChange,
  placeholder = undefined,
  ariaLabel,
  className = undefined,
  list = undefined,
  autoFocus = false,
  onBlur = undefined,
}) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      list={list}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        if (!composingRef.current) onValueChange(nextValue);
      }}
      onCompositionStart={(event) => {
        event.stopPropagation();
        composingRef.current = true;
      }}
      onCompositionUpdate={(event) => event.stopPropagation()}
      onCompositionEnd={(event) => {
        event.stopPropagation();
        composingRef.current = false;
        const nextValue = event.currentTarget.value;
        setDraft(nextValue);
        onValueChange(nextValue);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    />
  );
}

ImeInput.propTypes = {
  value: PropTypes.string.isRequired,
  onValueChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  ariaLabel: PropTypes.string.isRequired,
  className: PropTypes.string,
  list: PropTypes.string,
  autoFocus: PropTypes.bool,
  onBlur: PropTypes.func,
};
