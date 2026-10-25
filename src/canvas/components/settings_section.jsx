import PropTypes from "prop-types";
import { useId, useState } from "react";
import { IconChevronDown } from "../icons.jsx";
import InfoHint from "./info_hint.jsx";

export const SETTINGS_INPUT_CLASS =
  "min-h-9 w-full min-w-0 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

/** Label style shared by every stacked (label above input) field. */
export const SETTINGS_LABEL_CLASS = "flex min-w-0 flex-col gap-1.5 text-xs text-neutral-400";

export default function SettingsSection({ title, hint, testId, children }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-2 rounded-xl bg-neutral-900 p-3">
      <div className="text-xs font-medium text-neutral-400">
        <InfoHint label={title} text={hint} />
      </div>
      {children}
    </section>
  );
}

SettingsSection.propTypes = {
  title: PropTypes.string.isRequired,
  hint: PropTypes.string.isRequired,
  testId: PropTypes.string,
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
        className={`flex min-h-9 w-full min-w-0 items-center justify-between gap-3 text-left text-xs text-neutral-300 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
          flush ? "rounded-lg py-2" : "rounded-2xl p-4"
        }`}
      >
        <span className="shrink-0">{title}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          {!isExpanded && summary && (
            <span className="min-w-0 truncate text-xs text-neutral-400">
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
    <label className={SETTINGS_LABEL_CLASS}>
      <span>{label}</span>
      {children}
    </label>
  );
}

SettingsField.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
