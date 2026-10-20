import PropTypes from "prop-types";
import { IconSun } from "../../icons.jsx";
import {
  InspectorGroup,
  InspectorRow,
  InspectorSwitch,
} from "./three-inspector.jsx";
import { ColorField, NumberField } from "./three-scene-fields.jsx";

export function ThreeSceneLighting({
  lighting,
  environment,
  onChange,
  onEnvironmentChange,
  onCommit,
  t,
}) {
  const patchPosition = (axis, value) =>
    onChange({
      directionalPosition: { [axis]: value },
    });

  return (
    <InspectorGroup
      icon={IconSun}
      title={t("editor.three.lighting")}
      defaultOpen={false}
      testId="editor-three-light-group"
    >
      <NumberField
        label={t("editor.three.ambient")}
        value={lighting.ambientIntensity}
        min={0}
        max={10}
        step={0.1}
        onChange={(ambientIntensity) => onChange({ ambientIntensity })}
        onCommit={onCommit}
      />
      <div data-testid="editor-three-ambient-color">
        <ColorField
          label={t("editor.three.ambientColor")}
          value={lighting.ambientColor}
          onChange={(ambientColor) => onChange({ ambientColor })}
          onCommit={onCommit}
        />
      </div>
      <NumberField
        label={t("editor.three.directional")}
        value={lighting.directionalIntensity}
        min={0}
        max={10}
        step={0.1}
        onChange={(directionalIntensity) => onChange({ directionalIntensity })}
        onCommit={onCommit}
      />
      <div data-testid="editor-three-directional-color">
        <ColorField
          label={t("editor.three.directionalColor")}
          value={lighting.directionalColor}
          onChange={(directionalColor) => onChange({ directionalColor })}
          onCommit={onCommit}
        />
      </div>
      {["x", "y", "z"].map((axis) => (
        <div key={axis} data-testid={`editor-three-light-${axis}`}>
          <NumberField
            label={t(`editor.three.lightPosition${axis.toUpperCase()}`)}
            value={lighting.directionalPosition[axis]}
            onChange={(value) => patchPosition(axis, value)}
            onCommit={onCommit}
          />
        </div>
      ))}
      <InspectorRow label={t("editor.three.studioEnvironment")}>
        <InspectorSwitch
          checked={environment.type === "studio"}
          label={t("editor.three.studioEnvironment")}
          onChange={(enabled) => {
            onEnvironmentChange({ type: enabled ? "studio" : "none" });
            onCommit?.();
          }}
        />
      </InspectorRow>
      {environment.type === "studio" ? (
        <div data-testid="editor-three-studio-intensity">
          <NumberField
            label={t("editor.three.studioIntensity")}
            value={environment.intensity}
            min={0}
            max={4}
            step={0.1}
            onChange={(intensity) => onEnvironmentChange({ intensity })}
            onCommit={onCommit}
          />
        </div>
      ) : null}
    </InspectorGroup>
  );
}

ThreeSceneLighting.propTypes = {
  lighting: PropTypes.object.isRequired,
  environment: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onEnvironmentChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
