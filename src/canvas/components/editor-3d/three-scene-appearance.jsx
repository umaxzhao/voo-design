import PropTypes from "prop-types";
import {
  InspectorGroup,
  InspectorRow,
  InspectorSwitch,
} from "./three-inspector.jsx";
import { ColorField, NumberField, SelectField } from "./three-scene-fields.jsx";

function SceneSettingGroup({ title, testId, children }) {
  return (
    <InspectorGroup title={title} defaultOpen={false} testId={testId}>
      {children}
    </InspectorGroup>
  );
}

SceneSettingGroup.propTypes = {
  title: PropTypes.string.isRequired,
  testId: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export function ThreeSceneAppearance({
  fog,
  sky,
  shadows,
  colorGrading,
  grid,
  onChange,
  onCommit,
  t,
}) {
  const patch = (field, value) => onChange({ [field]: value });
  const patchFog = (changes) => {
    const next = { ...fog, ...changes };
    if (next.far <= next.near) {
      if ("near" in changes) next.far = next.near + 1;
      else next.near = Math.max(0, next.far - 1);
    }
    patch("fog", next);
  };

  return (
    <>
      <SceneSettingGroup
        title={t("editor.three.globalSettings")}
        testId="editor-three-global-group"
      >
        <div data-testid="editor-three-grid-plane">
          <SelectField
            label={t("editor.three.gridPlane")}
            value={grid.plane}
            options={[
              { value: "xy", label: t("editor.three.planeXY") },
              { value: "xz", label: t("editor.three.planeXZ") },
              { value: "yz", label: t("editor.three.planeYZ") },
              { value: "off", label: t("editor.three.planeOff") },
            ]}
            onChange={(plane) => patch("grid", { ...grid, plane })}
            onCommit={onCommit}
          />
        </div>
        <div data-testid="editor-three-snapping">
          <SelectField
            label={t("editor.three.snapping")}
            value={grid.snapping}
            options={[
              { value: "off", label: t("editor.three.snapOff") },
              { value: "grid", label: t("editor.three.snapGrid") },
            ]}
            onChange={(snapping) => patch("grid", { ...grid, snapping })}
            onCommit={onCommit}
          />
        </div>
        {grid.snapping === "grid" ? (
          <div data-testid="editor-three-grid-step">
            <NumberField
              label={t("editor.three.gridStep")}
              value={grid.step}
              min={1}
              max={1000}
              step={1}
              onChange={(step) => patch("grid", { ...grid, step })}
              onCommit={onCommit}
            />
          </div>
        ) : null}
      </SceneSettingGroup>

      <SceneSettingGroup
        title={t("editor.three.fog")}
        testId="editor-three-fog-group"
      >
        <InspectorRow label={t("editor.three.fog")}>
          <InspectorSwitch
            checked={fog.enabled}
            label={t("editor.three.fog")}
            onChange={(enabled) => {
              patchFog({ enabled });
              onCommit?.();
            }}
          />
        </InspectorRow>
        {fog.enabled ? (
          <>
            <div data-testid="editor-three-fog-color">
              <ColorField
                label={t("editor.three.fogColor")}
                value={fog.color}
                onChange={(color) => patchFog({ color })}
                onCommit={onCommit}
              />
            </div>
            <NumberField
              label={t("editor.three.fogNear")}
              value={fog.near}
              min={0}
              max={99999}
              step={1}
              onChange={(near) => patchFog({ near })}
              onCommit={onCommit}
            />
            <NumberField
              label={t("editor.three.fogFar")}
              value={fog.far}
              min={1}
              max={100000}
              step={1}
              onChange={(far) => patchFog({ far })}
              onCommit={onCommit}
            />
          </>
        ) : null}
      </SceneSettingGroup>

      <SceneSettingGroup
        title={t("editor.three.sky")}
        testId="editor-three-sky-group"
      >
        <InspectorRow label={t("editor.three.sky")}>
          <InspectorSwitch
            checked={sky.enabled}
            label={t("editor.three.sky")}
            onChange={(enabled) => {
              patch("sky", { ...sky, enabled });
              onCommit?.();
            }}
          />
        </InspectorRow>
        {sky.enabled ? (
          <>
            <SelectField
              label={t("editor.three.skyMode")}
              value={sky.mode}
              options={[
                { value: "solid", label: t("editor.three.skySolid") },
                { value: "gradient", label: t("editor.three.skyGradient") },
              ]}
              onChange={(mode) => patch("sky", { ...sky, mode })}
              onCommit={onCommit}
            />
            <ColorField
              label={t("editor.three.skyColor")}
              value={sky.color}
              onChange={(color) => patch("sky", { ...sky, color })}
              onCommit={onCommit}
            />
            {sky.mode === "gradient" ? (
              <ColorField
                label={t("editor.three.skyHorizon")}
                value={sky.horizonColor}
                onChange={(horizonColor) =>
                  patch("sky", { ...sky, horizonColor })
                }
                onCommit={onCommit}
              />
            ) : null}
          </>
        ) : null}
      </SceneSettingGroup>

      <SceneSettingGroup
        title={t("editor.three.ambientShadows")}
        testId="editor-three-shadows-group"
      >
        <InspectorRow label={t("editor.three.ambientShadows")}>
          <InspectorSwitch
            checked={shadows.enabled}
            label={t("editor.three.ambientShadows")}
            onChange={(enabled) => {
              patch("shadows", { ...shadows, enabled });
              onCommit?.();
            }}
          />
        </InspectorRow>
        {shadows.enabled ? (
          <>
            <NumberField
              label={t("editor.three.shadowIntensity")}
              value={shadows.intensity}
              min={0}
              max={1}
              step={0.01}
              onChange={(intensity) =>
                patch("shadows", { ...shadows, intensity })
              }
              onCommit={onCommit}
            />
            <NumberField
              label={t("editor.three.shadowSoftness")}
              value={shadows.softness}
              min={0}
              max={1}
              step={0.01}
              onChange={(softness) =>
                patch("shadows", { ...shadows, softness })
              }
              onCommit={onCommit}
            />
          </>
        ) : null}
      </SceneSettingGroup>

      <SceneSettingGroup
        title={t("editor.three.colorGrading")}
        testId="editor-three-color-grading-group"
      >
        <div data-testid="editor-three-exposure">
          <NumberField
            label={t("editor.three.exposure")}
            value={colorGrading.exposure}
            min={-2}
            max={2}
            step={0.01}
            onChange={(exposure) =>
              patch("colorGrading", { ...colorGrading, exposure })
            }
            onCommit={onCommit}
          />
        </div>
        <div data-testid="editor-three-saturation">
          <NumberField
            label={t("editor.three.saturation")}
            value={colorGrading.saturation}
            min={0}
            max={2}
            step={0.01}
            onChange={(saturation) =>
              patch("colorGrading", { ...colorGrading, saturation })
            }
            onCommit={onCommit}
          />
        </div>
      </SceneSettingGroup>

    </>
  );
}

ThreeSceneAppearance.propTypes = {
  fog: PropTypes.object.isRequired,
  sky: PropTypes.object.isRequired,
  shadows: PropTypes.object.isRequired,
  colorGrading: PropTypes.object.isRequired,
  grid: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
