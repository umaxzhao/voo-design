import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";

/**
 * Controls for the currently-selected Puppet Warp pin (the green one): an
 * absolute rotation angle field plus −15°/+15° buttons, a move-to-front /
 * move-to-back pair, and a Fixed toggle that prevents the pin from being
 * dragged by surrounding pin movements.
 *
 * When no pin is selected the section renders nothing (the panel stays on the
 * generic warp sections). The pin's rotation pivot is fixed to the image
 * centre by the engine; see `setPuppetPinRotation` for the semantics.
 */
export default function PuppetPinSection({
  pins = [],
  pinId = null,
  rotation = 0,
  onRotate = null,
  onMoveDepth = null,
  onToggleFixed = null,
}) {
  const { t } = useI18n();
  if (!pinId) return null;
  const pin = pins.find((entry) => entry.id === pinId);
  if (!pin) return null;

  const current = Math.round(rotation ?? 0);
  const isFixed = Boolean(pin.fixed);

  return (
    <StaticSection title={t("editor.puppet.pinControls")}>
      <div className="space-y-1.5">
        {/* Fixed / Unlock toggle — most important control, shown first */}
        <button
          type="button"
          onClick={() => onToggleFixed?.()}
          className={`w-full rounded-xl py-1.5 text-[11px] font-mono transition-colors ${
            isFixed
              ? "bg-emerald-500/20 text-emerald-300 font-medium hover:bg-emerald-500/30"
              : "bg-[#222222] text-neutral-300 hover:bg-[#2a2a2a] hover:text-white"
          }`}
        >
          {isFixed ? t("editor.puppet.unfix") : t("editor.puppet.fix")}
        </button>

        {/* Rotation — disabled when pin is fixed */}
        <ScrubField
          prefix={
            <svg
              className="h-3.5 w-3.5 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="12" x2="18" y2="6" />
              <circle cx="12" cy="12" r="8" />
            </svg>
          }
          suffix="°"
          min={-360}
          max={360}
          value={current}
          onValueChange={(val) => onRotate?.(val)}
          ariaLabel={t("editor.puppet.rotation")}
          scrubHint={t("editor.props.dragToAdjust")}
          showRange
          disabled={isFixed}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onRotate?.(current - 15)}
            disabled={isFixed}
            title={`${t("editor.puppet.rotateMinus")} (−15°)`}
            className="rounded-xl bg-[#222222] px-2 py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            {t("editor.puppet.rotateMinus")} −15°
          </button>
          <button
            type="button"
            onClick={() => onRotate?.(current + 15)}
            disabled={isFixed}
            title={`${t("editor.puppet.rotatePlus")} (+15°)`}
            className="rounded-xl bg-[#222222] px-2 py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            {t("editor.puppet.rotatePlus")} +15°
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onMoveDepth?.("back")}
            className="rounded-xl bg-[#222222] px-2 py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
          >
            {t("editor.puppet.moveBack")}
          </button>
          <button
            type="button"
            onClick={() => onMoveDepth?.("front")}
            className="rounded-xl bg-[#222222] px-2 py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
          >
            {t("editor.puppet.moveFront")}
          </button>
        </div>
      </div>
    </StaticSection>
  );
}

PuppetPinSection.propTypes = {
  /** The selected node's pins (engine truth). */
  pins: PropTypes.array,
  /** The selected (green) pin's id; null hides the section. */
  pinId: PropTypes.string,
  /** The pin's current absolute rotation in degrees (engine readback). */
  rotation: PropTypes.number,
  /** Set the pin's absolute rotation, in degrees. */
  onRotate: PropTypes.func,
  /** Move the pin to the front ("front") or back ("back") of the stacking order. */
  onMoveDepth: PropTypes.func,
  /** Toggle the selected pin's fixed state. */
  onToggleFixed: PropTypes.func,
};
