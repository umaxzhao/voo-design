import PropTypes from "prop-types";
import {
  ICON_STROKE_WIDTH,
  IconChevronDown,
  IconChevronUp,
  IconTrash,
} from "../../icons.jsx";
import {
  MATERIAL_BLEND_MODES,
  MATERIAL_LAYER_TYPES,
  MATERIAL_MATCAP_PRESETS,
} from "../../editor/three-scene-materials.js";
import { ColorField, NumberField, SelectField } from "./three-scene-fields.jsx";

export const ICON_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40";
const POWER_BOUNDS = {
  fresnel: { min: 0, max: 10, step: 0.1 },
  matcap: { min: 0, max: 10, step: 0.1 },
  noise: { min: 0.1, max: 20, step: 0.1 },
  toon: { min: 2, max: 16, step: 1 },
  depth: { min: 0.1, max: 10000, step: 10 },
  rainbow: { min: 0, max: 10, step: 0.1 },
  outline: { min: 0, max: 16, step: 0.1 },
};

export function LayerAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  testId,
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={ICON_BUTTON_CLASS}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={13} strokeWidth={ICON_STROKE_WIDTH} />
    </button>
  );
}

LayerAction.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  testId: PropTypes.string,
};

export function MaterialLayerRow({
  layer,
  index,
  count,
  expanded,
  onExpand,
  onChange,
  onMove,
  onRemove,
  onCommit,
  t,
}) {
  const layerLabel = t(`editor.three.layerType.${layer.type}`);
  const typeOptions = MATERIAL_LAYER_TYPES.map((type) => ({
    value: type,
    label: t(`editor.three.layerType.${type}`),
  }));
  const blendOptions = MATERIAL_BLEND_MODES.map((mode) => ({
    value: mode,
    label: t(`editor.three.blend.${mode}`),
  }));
  return (
    <li
      data-testid="editor-three-material-layer-row"
      data-layer-id={layer.id}
      data-layer-type={layer.type}
      className="min-w-0 rounded-xl bg-white/[0.06] p-1"
    >
      <div className="flex min-w-0 items-center gap-1">
        <input
          type="checkbox"
          className="flat-check shrink-0"
          aria-label={t("editor.three.layerEnabled", { layer: layerLabel })}
          checked={layer.enabled}
          onChange={(event) => {
            onChange({ enabled: event.target.checked });
            onCommit?.();
          }}
        />
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 text-left text-[11px] text-neutral-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          aria-expanded={expanded}
          onClick={onExpand}
        >
          <span className="min-w-0 flex-1 truncate">{layerLabel}</span>
          <IconChevronDown
            size={12}
            strokeWidth={ICON_STROKE_WIDTH}
            className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        </button>
        <LayerAction
          icon={IconChevronUp}
          label={t("editor.three.layerUp")}
          onClick={() => onMove(-1)}
          disabled={index === 0}
        />
        <LayerAction
          icon={IconChevronDown}
          label={t("editor.three.layerDown")}
          onClick={() => onMove(1)}
          disabled={index === count - 1}
        />
        <LayerAction
          icon={IconTrash}
          label={t("editor.three.layerRemove")}
          onClick={onRemove}
          disabled={count === 1}
        />
      </div>
      {expanded ? (
        <div className="flex flex-col gap-2 px-1 pb-1 pt-2">
          <SelectField
            label={t("editor.three.layerType")}
            value={layer.type}
            options={typeOptions}
            onChange={(type) => onChange({ type })}
            onCommit={onCommit}
          />
          {layer.type !== "normal" ? (
            <ColorField
              label={t("editor.three.layerColor")}
              value={layer.color}
              onChange={(color) => onChange({ color })}
              onCommit={onCommit}
            />
          ) : null}
          {["gradient", "noise", "toon", "depth"].includes(layer.type) ? (
            <ColorField
              label={t(
                layer.type === "gradient"
                  ? "editor.three.layerEndColor"
                  : layer.type === "depth"
                    ? "editor.three.depthFarColor"
                    : "editor.three.layerSecondaryColor",
              )}
              value={layer.secondaryColor}
              onChange={(secondaryColor) => onChange({ secondaryColor })}
              onCommit={onCommit}
            />
          ) : null}
          {layer.type === "matcap" ? (
            <>
              <SelectField
                label={t("editor.three.matcapPreset")}
                value={layer.matcapPreset ?? "chrome"}
                options={MATERIAL_MATCAP_PRESETS.map((preset) => ({
                  value: preset,
                  label: t(`editor.three.matcapPreset.${preset}`),
                }))}
                onChange={(matcapPreset) => onChange({ matcapPreset })}
                onCommit={onCommit}
              />
              <NumberField
                label={t("editor.three.matcapRotation")}
                value={layer.matcapRotation ?? 0}
                min={-360}
                max={360}
                step={1}
                onChange={(matcapRotation) => onChange({ matcapRotation })}
                onCommit={onCommit}
              />
            </>
          ) : null}
          <NumberField
            label={t("editor.three.layerOpacity")}
            value={layer.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(opacity) => onChange({ opacity })}
            onCommit={onCommit}
          />
          {[
            "fresnel",
            "matcap",
            "noise",
            "toon",
            "depth",
            "rainbow",
            "outline",
          ].includes(layer.type) ? (
            <NumberField
              label={t(
                {
                  fresnel: "editor.three.layerPower",
                  matcap: "editor.three.matcapPower",
                  noise: "editor.three.noiseFrequency",
                  toon: "editor.three.toonSteps",
                  depth: "editor.three.depthRange",
                  rainbow: "editor.three.rainbowFrequency",
                  outline: "editor.three.outlineWidth",
                }[layer.type],
              )}
              value={layer.power}
              {...POWER_BOUNDS[layer.type]}
              onChange={(power) => onChange({ power })}
              onCommit={onCommit}
            />
          ) : null}
          <SelectField
            label={t("editor.three.layerBlend")}
            value={layer.blendMode}
            options={blendOptions}
            onChange={(blendMode) => onChange({ blendMode })}
            onCommit={onCommit}
          />
        </div>
      ) : null}
    </li>
  );
}

MaterialLayerRow.propTypes = {
  layer: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired,
  expanded: PropTypes.bool.isRequired,
  onExpand: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
