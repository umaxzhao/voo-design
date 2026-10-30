import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";

/** Layout numbers commit once; Escape cancels typing before closing a popover. */
export default function LayoutNumberInput({ value, onChange, optional = false, ...props }) {
  const text = value == null ? "" : String(value);
  const [draft, setDraft] = useState(text);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(text); }, [text]);
  return <input {...props} type="number" min="0" step="1" value={draft}
    onFocus={() => { focused.current = true; cancelled.current = false; }}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => {
      focused.current = false;
      if (cancelled.current) { cancelled.current = false; return; }
      const next = draft === "" && optional ? null : Number(draft);
      if (next !== null && !Number.isFinite(next)) { setDraft(text); return; }
      const normalized = next === null ? null : Math.max(0, next);
      if (normalized !== value) onChange(normalized);
    }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelled.current = true;
      setDraft(text);
      const surface = event.currentTarget.closest('[role="dialog"]');
      event.currentTarget.blur();
      surface?.focus();
    }} />;
}
LayoutNumberInput.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  optional: PropTypes.bool,
};
