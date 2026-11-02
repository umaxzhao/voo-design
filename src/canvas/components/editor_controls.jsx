import PropTypes from "prop-types";

export const controlClass =
  "w-full rounded-lg bg-transparent px-0 py-1 text-[11px] leading-relaxed text-neutral-200 outline-none transition-colors placeholder:text-neutral-400";

export function EditorField({ label, children, compact = false }) {
  return (
    <label className={compact ? "block min-w-0" : "block"}>
      <span className="mb-1.5 block text-[9px] font-medium uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

EditorField.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  compact: PropTypes.bool,
};

export function InlineToggle({ label, checked, onChange, title = undefined }) {
  return (
    <label
      title={title ?? label}
      className="group/toggle flex shrink-0 cursor-pointer items-center gap-1.5"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-3.5 w-6 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-white/80 peer-focus-visible:ring-1 peer-focus-visible:ring-[#a7ffd4]/40 after:absolute after:left-0.5 after:top-0.5 after:h-2.5 after:w-2.5 after:rounded-full after:bg-neutral-900 after:transition-transform peer-checked:after:translate-x-2.5"
      />
      <span className="whitespace-nowrap text-[10px] text-neutral-500 peer-checked:text-neutral-300">
        {label}
      </span>
    </label>
  );
}

InlineToggle.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  title: PropTypes.string,
};
