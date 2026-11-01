import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import {
  formatGradient,
  getGradientInsertionPosition,
  insertGradientStop,
} from "./gradient_fill.js";

/** Minimum number of stops; deleting below this is a no-op. */
export const MIN_STOPS = 2;

export function deleteGradientStop(stops, index) {
  if (!Array.isArray(stops) || stops.length <= MIN_STOPS) return stops;
  return stops.filter((_, i) => i !== index);
}

export function GradientStopsBar({
  stops,
  activeStopIndex,
  onSelectStop,
  onChangeStops,
  gradientType,
  angle,
  geometry,
  onApplyGradient,
}) {
  const { t } = useI18n();
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  const handleBarClick = (e) => {
    if (e.target.dataset.stopHandle) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.round(
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100,
    );
    const { stops: nextStops, insertedIndex } = insertGradientStop(stops, pos);
    onChangeStops(nextStops);
    onSelectStop(insertedIndex);
    if (onApplyGradient) {
      onApplyGradient(formatGradient(gradientType, angle, nextStops, geometry));
    }
  };

  const handleHandleMouseDown = (index, e) => {
    e.stopPropagation();
    e.preventDefault?.();
    onSelectStop(index);
    if (e.currentTarget && typeof e.currentTarget.focus === "function") {
      e.currentTarget.focus();
    }
    const bar = e.currentTarget.parentElement;
    if (!bar) return;

    const startX = e.clientX;
    const initialPos = stops[index]?.position ?? 0;
    /** Track whether the pointer ever left the bar during this drag. */
    let deletePending = false;

    const handlePointerMove = (ev) => {
      const rect = bar.getBoundingClientRect();
      // Drag more than 30 px above/below the bar to trigger delete
      const verticalOffset = Math.abs(ev.clientY - rect.top - rect.height / 2);
      deletePending = verticalOffset > 30;

      if (!deletePending) {
        const newPos = Math.round(
          Math.max(
            0,
            Math.min(
              100,
              initialPos + ((ev.clientX - startX) / rect.width) * 100,
            ),
          ),
        );
        const nextStops = stops.map((stop, i) =>
          i === index ? { ...stop, position: newPos } : stop,
        );
        onChangeStops(nextStops);
        if (onApplyGradient) {
          onApplyGradient(
            formatGradient(gradientType, angle, nextStops, geometry),
          );
        }
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);

      // Delete-by-drag-off: only when we still have more than the minimum.
      if (deletePending && stops.length > MIN_STOPS) {
        const nextStops = deleteGradientStop(stops, index);
        onChangeStops(nextStops);
        // Clamp active index to the last valid stop.
        onSelectStop(Math.min(activeStopIndex, nextStops.length - 1));
        if (onApplyGradient) {
          onApplyGradient(
            formatGradient(gradientType, angle, nextStops, geometry),
          );
        }
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
  };

  const handleDeleteStop = (index) => {
    if (stops.length > MIN_STOPS) {
      const nextStops = deleteGradientStop(stops, index);
      onChangeStops(nextStops);
      onSelectStop(Math.min(activeStopIndex, nextStops.length - 1));
      if (onApplyGradient) {
        onApplyGradient(
          formatGradient(gradientType, angle, nextStops, geometry),
        );
      }
    }
  };

  const previewGradient = `linear-gradient(to right, ${sortedStops
    .map((s) => `${s.color} ${s.position}%`)
    .join(", ")})`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
        <span>{t("editor.colorPicker.stops", { n: stops.length })}</span>
        <button
          type="button"
          onClick={() => {
            const nextPos = getGradientInsertionPosition(stops);
            const { stops: nextStops, insertedIndex } = insertGradientStop(
              stops,
              nextPos,
            );
            onChangeStops(nextStops);
            onSelectStop(insertedIndex);
            if (onApplyGradient) {
              onApplyGradient(
                formatGradient(gradientType, angle, nextStops, geometry),
              );
            }
          }}
          className="text-neutral-300 hover:text-white"
        >
          {t("editor.colorPicker.addStop")}
        </button>
      </div>

      <div
        onClick={handleBarClick}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            if (activeStopIndex >= 0 && activeStopIndex < stops.length) {
              e.preventDefault();
              handleDeleteStop(activeStopIndex);
            }
          }
        }}
        tabIndex={0}
        style={{ background: previewGradient }}
        className="relative h-4 w-full cursor-pointer rounded-md border border-white/10 select-none touch-none outline-none"
      >
        {stops.map((stop, idx) => (
          <div
            key={idx}
            data-stop-handle="true"
            role="button"
            tabIndex={0}
            aria-label={t("editor.colorPicker.gradientStop", { index: idx + 1 })}
            onPointerDown={(e) => handleHandleMouseDown(idx, e)}
            onMouseDown={(e) => handleHandleMouseDown(idx, e)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteStop(idx);
              }
            }}
            style={{
              left: `${stop.position}%`,
              backgroundColor: stop.color,
            }}
            className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
              activeStopIndex === idx
                ? "border-white ring-2 ring-white/40 z-10"
                : "border-black/60"
            }`}
          />
        ))}
      </div>
      <p className="text-[9px] font-mono text-neutral-500 text-right">
        {t("editor.colorPicker.dragOffToDelete")}
      </p>
    </div>
  );
}

GradientStopsBar.propTypes = {
  stops: PropTypes.arrayOf(
    PropTypes.shape({
      color: PropTypes.string.isRequired,
      opacity: PropTypes.number.isRequired,
      position: PropTypes.number.isRequired,
    }),
  ).isRequired,
  activeStopIndex: PropTypes.number.isRequired,
  onSelectStop: PropTypes.func.isRequired,
  onChangeStops: PropTypes.func.isRequired,
  gradientType: PropTypes.string.isRequired,
  angle: PropTypes.string.isRequired,
  geometry: PropTypes.object,
  onApplyGradient: PropTypes.func,
};
