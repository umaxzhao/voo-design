import PropTypes from "prop-types";

/**
 * OnboardingStepProgress
 *
 * Smooth sliding indicator over a track of step slots for onboarding.
 * Non-draggable / status role="progressbar" with reduced-motion respect.
 */
export function OnboardingStepProgress({ stepIndex, steps, label }) {
  const total = steps.length;
  const current = Math.min(Math.max(stepIndex + 1, 1), total);

  return (
    <span
      data-testid="onboarding-step-indicator"
      data-step-count={total}
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      className="relative flex shrink-0 items-center gap-1"
    >
      {steps.map((stepKey, idx) => (
        <span
          key={stepKey}
          className={`h-1 w-4 rounded-full transition-colors duration-300 ${
            idx < stepIndex ? "bg-white/25" : "bg-white/[0.08]"
          }`}
        />
      ))}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-1 w-4 rounded-full bg-[#a7ffd4] transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          transform: `translateX(calc(${stepIndex} * (1rem + 0.25rem)))`,
        }}
      />
    </span>
  );
}

OnboardingStepProgress.propTypes = {
  stepIndex: PropTypes.number.isRequired,
  steps: PropTypes.arrayOf(PropTypes.string).isRequired,
  label: PropTypes.string,
};
