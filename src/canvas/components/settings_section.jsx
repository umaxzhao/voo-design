import PropTypes from "prop-types";
import { useId, useState } from "react";
import { IconChevronDown } from "../icons.jsx";
import InfoHint from "./info_hint.jsx";

export const SETTINGS_INPUT_CLASS =
  "min-h-12 w-full min-w-0 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

export default function SettingsSection({ title, hint, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-neutral-950 p-4">
      <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 font-medium">
        <InfoHint label={title} text={hint} />
      </div>
      {children}
    </section>
  );
}

SettingsSection.propTypes = {
  title: PropTypes.string.isRequired,
  hint: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export function SettingsDisclosure({
  title,
  hint: _hint,
  summary,
  testId,
  children,
  expanded,
  onToggle,
  flush = false,
}) {
  const [internalExpanded, setExpanded] = useState(false);
  const contentId = useId();
  const isExpanded = expanded ?? internalExpanded;
  return (
    <section className={flush ? "flex flex-col" : "rounded-2xl bg-neutral-950"}>
      <button
        type="button"
        data-testid={testId}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() =>
          onToggle ? onToggle(!isExpanded) : setExpanded(!isExpanded)
        }
        className={`flex min-h-12 w-full min-w-0 items-center justify-between gap-3 text-left text-[11px] text-neutral-300 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
          flush ? "rounded-lg py-2" : "rounded-2xl p-4"
        }`}
      >
        <span className="shrink-0">{title}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          {!isExpanded && summary && (
            <span className="min-w-0 truncate text-[10px] text-neutral-400">
              {summary}
            </span>
          )}
          <IconChevronDown
            size={14}
            className={`shrink-0 ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {isExpanded && (
        <div
          id={contentId}
          className={`flex flex-col gap-4 ${flush ? "" : "px-4 pb-4"}`}
        >
          {children}
        </div>
      )}
    </section>
  );
}

SettingsDisclosure.propTypes = {
  title: PropTypes.string.isRequired,
  hint: PropTypes.string,
  summary: PropTypes.node,
  testId: PropTypes.string,
  children: PropTypes.node.isRequired,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func,
  flush: PropTypes.bool,
};

export function SettingsField({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[11px] text-neutral-400">
      <span>{label}</span>
      {children}
    </label>
  );
}

SettingsField.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
