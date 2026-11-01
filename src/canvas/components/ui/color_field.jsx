import PropTypes from "prop-types";
import { useEffect, useState } from "react";

export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export const NONE_PATTERN =
  "repeating-conic-gradient(#3a3a3a 0% 25%, #232323 0% 50%) 0 0 / 8px 8px";

export function parseHex(text) {
  let hex = String(text).trim().toLowerCase();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return HEX_COLOUR.test(hex) ? hex : null;
}

/**
 * Canonical tool-grade color swatch button.
 * Strictly avoids AI tells like hover:scale-105.
 */
export function ColorSwatch({
  value = null,
  onClick = undefined,
  ariaLabel = "Color swatch",
  disabled = false,
  className = "",
  testId = undefined,
}) {
  const valid = HEX_COLOUR.test(value ?? "");
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-inset ring-white/15 outline-none transition-colors hover:ring-white/30 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{
        background: valid ? value : NONE_PATTERN,
      }}
    />
  );
}

ColorSwatch.propTypes = {
  value: PropTypes.string,
  onClick: PropTypes.func,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
};

/**
 * Canonical hex text input.
 */
export function HexInput({
  value,
  onChange = undefined,
  onCommit = undefined,
  ariaLabel = "Hex color",
  disabled = false,
  className = "",
  testId = undefined,
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value : "#FFFFFF";
  const [draft, setDraft] = useState(hex.slice(1).toUpperCase());
  useEffect(() => setDraft(hex.slice(1).toUpperCase()), [hex]);

  const handleCommit = () => {
    const parsed = parseHex(draft);
    if (parsed) {
      onChange?.(parsed);
      onCommit?.(parsed);
    } else {
      setDraft(hex.slice(1).toUpperCase());
    }
  };

  return (
    <input
      type="text"
      data-testid={testId}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value.toUpperCase())}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={`h-6 w-16 rounded-lg bg-neutral-800 px-1.5 text-[10px] font-mono tabular-nums uppercase text-neutral-100 outline-none transition-colors hover:bg-white/[0.06] focus:ring-1 focus:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

HexInput.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  onCommit: PropTypes.func,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  testId: PropTypes.string,
};

/**
 * Unified ColorField with Swatch + HexInput.
 */
export function ColorField({
  value,
  onChange,
  onCommit = undefined,
  onOpenPicker = undefined,
  ariaLabel = "Color",
  disabled = false,
  className = "",
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <ColorSwatch
        value={value}
        onClick={onOpenPicker}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
      <HexInput
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabel={`${ariaLabel} hex`}
        disabled={disabled}
      />
    </div>
  );
}

ColorField.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  onOpenPicker: PropTypes.func,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};
