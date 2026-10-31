import PropTypes from "prop-types";

/** `<input type="color">` only accepts full 6-digit hex, not names or rgba(). */
export const HEX_COLOUR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Normalise a hex field's text: add the #, expand the 3-digit shorthand. */
export function parseHex(text) {
  let hex = String(text).trim().toLowerCase();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return HEX_COLOUR.test(hex) ? hex : null;
}

/**
 * Editable hex text, Figma-style: commits on blur or Enter, accepts `abc`,
 * `#abc` and `aabbcc` as well as the full `#aabbcc`. Invalid text snaps back
 * to the current colour (the keyed defaultValue re-renders it).
 */
export function HexField({
  value = null,
  onCommit,
  ariaLabel
}) {
  const valid = HEX_COLOUR.test(value ?? "");
  return <input key={valid ? value : "none"} type="text" defaultValue={valid ? value : ""} placeholder="—" spellCheck={false} aria-label={ariaLabel} onKeyDown={event => {
    if (event.key === "Enter") event.currentTarget.blur();
  }} onBlur={event => {
    const hex = parseHex(event.target.value);
    if (hex && hex !== value) onCommit(hex);
  }} className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none uppercase cursor-text placeholder:text-neutral-400" />;
}
HexField.propTypes = {
  value: PropTypes.string,
  onCommit: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired
};
