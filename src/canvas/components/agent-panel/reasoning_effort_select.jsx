import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { setStoredCodexReasoningEffort } from "../../../shared/codex-reasoning.js";
import { useI18n } from "../../use_i18n.js";
import InfoHint from "../info_hint.jsx";

const RANGE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** Model capabilities come from Codex; the UI must never invent effort levels. */
export default function ReasoningEffortSelect({
  model,
  effort = null,
  efforts = [],
  capabilityError = null,
  disabled = false,
  className = "w-28 shrink-0",
  onRefresh,
  onError,
}) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const savingRef = useRef(false);
  const interactionRef = useRef(null);
  const previewRef = useRef(null);
  const selectedIndex = Math.max(0, efforts.indexOf(effort));
  const sliderDisabled = disabled || saving || efforts.length < 2;

  const resetPreview = () => {
    previewRef.current = null;
    setPreviewIndex(null);
  };

  const saveIndex = async (index) => {
    const nextEffort = efforts[index];
    if (disabled || savingRef.current || !nextEffort || nextEffort === effort) {
      resetPreview();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    onError(null);
    try {
      await setStoredCodexReasoningEffort(model, nextEffort);
      // Keep the control locked until the refreshed config is used by chat.
      await onRefresh();
    } catch (error) {
      console.error(
        "[ReasoningEffortSelect] Failed to save reasoning effort",
        error,
      );
      onError(t("agent.reasoning.saveFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
      resetPreview();
    }
  };

  const commitInteraction = () => {
    const index = previewRef.current;
    interactionRef.current = null;
    if (index === null) return;
    void saveIndex(index);
  };

  const cancelInteraction = () => {
    interactionRef.current = null;
    resetPreview();
  };

  const handleChange = (event) => {
    if (
      sliderDisabled ||
      savingRef.current ||
      interactionRef.current?.cancelled
    )
      return;
    const index = Number(event.currentTarget.value);
    if (!Number.isInteger(index) || !efforts[index]) return;
    previewRef.current = index;
    setPreviewIndex(index);
    // Screen-reader value changes may arrive without pointer or key events.
    if (!interactionRef.current) void saveIndex(index);
  };

  const handlePointerDown = (event) => {
    if (sliderDisabled || event.button !== 0) return;
    event.stopPropagation();
    interactionRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    // A drag changes the preview repeatedly but writes only on release.
    commitInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      const pointerId = interactionRef.current?.pointerId;
      cancelInteraction();
      // Ignore the rest of a cancelled drag until its pointer is released.
      if (pointerId !== undefined) {
        interactionRef.current = { pointerId, cancelled: true };
      }
    } else if (RANGE_KEYS.has(event.key) && !sliderDisabled) {
      interactionRef.current = { keyboard: true };
    }
  };

  const handleKeyUp = (event) => {
    event.stopPropagation();
    if (RANGE_KEYS.has(event.key) && interactionRef.current?.keyboard) {
      commitInteraction();
    }
  };

  const previewEffort = previewIndex === null ? effort : efforts[previewIndex];
  const valueText = previewEffort
    ? t(`agent.reasoning.${previewEffort}`)
    : t("agent.reasoning.default");
  const hint = capabilityError
    ? t(capabilityError)
    : t(
        efforts.length > 0
          ? "agent.reasoning.hint"
          : "agent.reasoning.unavailable",
      );

  return (
    <div
      data-testid="agent-reasoning-effort"
      aria-busy={saving}
      className={`flex ${className} flex-col rounded-lg bg-white/[0.06] px-2 py-1`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] text-[#eed0ff]">
          {saving ? t("agent.reasoning.saving") : valueText}
        </span>
        <InfoHint label="" text={hint} />
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, efforts.length - 1)}
        step={1}
        value={previewIndex ?? selectedIndex}
        disabled={sliderDisabled}
        aria-label={t("agent.reasoning.label")}
        aria-valuetext={valueText}
        onChange={handleChange}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelInteraction}
        onLostPointerCapture={() => {
          if (interactionRef.current?.pointerId !== undefined) {
            cancelInteraction();
          }
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={commitInteraction}
        className="flat-range w-full rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/50"
      />
    </div>
  );
}

ReasoningEffortSelect.propTypes = {
  model: PropTypes.string.isRequired,
  effort: PropTypes.string,
  efforts: PropTypes.arrayOf(PropTypes.string),
  capabilityError: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
};
