import PropTypes from "prop-types";
import { IconCheck } from "../../icons.jsx";

/**
 * A flat choice row for the onboarding steps. No outline: the selected row is a
 * brighter fill and a white check, the rest sit on the modal surface.
 */
export default function OnboardingFlatOption({
  testId,
  role,
  leading,
  title,
  description,
  selected,
  onSelect,
  children,
}) {
  return (
    <div
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      data-testid={testId}
      onClick={onSelect}
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-4 transition-colors ${
        selected ? "bg-white/[0.1]" : "bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-semibold text-neutral-100">{title}</span>
        <span className="truncate text-[11px] text-neutral-400">{description}</span>
        {children}
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-white text-black" : "bg-white/[0.08]"
        }`}
      >
        {selected && <IconCheck size={10} strokeWidth={3} />}
      </span>
    </div>
  );
}

OnboardingFlatOption.propTypes = {
  testId: PropTypes.string.isRequired,
  role: PropTypes.string,
  leading: PropTypes.node,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  selected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  children: PropTypes.node,
};
