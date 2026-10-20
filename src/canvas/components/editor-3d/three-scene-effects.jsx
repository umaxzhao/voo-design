import PropTypes from "prop-types";
import { InspectorGroup, InspectorRow, InspectorSwitch } from "./three-inspector.jsx";
import { NumberField } from "./three-scene-fields.jsx";

const EFFECTS = ["bloom", "vignette", "grain", "chromaticAberration"];

export default function ThreeSceneEffects({ effects, onChange, onCommit, t, defaultOpen = false }) {
  const change = (patch) => onChange({ ...effects, ...patch });
  const toggle = (name, enabled) =>
    change({ [name]: { ...effects[name], enabled } });
  const master = (
    <InspectorSwitch
      checked={effects.enabled}
      label={t("editor.three.effects")}
      onChange={(enabled) => { change({ enabled }); onCommit?.(); }}
    />
  );
  return (
    <InspectorGroup
      title={t("editor.three.effects")}
      defaultOpen={defaultOpen}
      extra={master}
      testId="editor-three-effects-group"
    >
      {effects.enabled && EFFECTS.map((name) => {
        const item = effects[name];
        return (
          <div className="grid gap-2" key={name}>
            <InspectorRow label={t(`editor.three.effect.${name}`)}>
              <InspectorSwitch
                checked={item.enabled}
                label={t(`editor.three.effect.${name}`)}
                onChange={(enabled) => { toggle(name, enabled); onCommit?.(); }}
              />
            </InspectorRow>
            {item.enabled && Object.entries(item)
              .filter(([key]) => key !== "enabled")
              .map(([key, value]) => (
                <NumberField
                  key={key}
                  label={t(`editor.three.effect.${name}.${key}`)}
                  value={value}
                  min={0}
                  max={name === "bloom" && key === "strength" ? 3 : name === "chromaticAberration" && key === "offset" ? 0.02 : 1}
                  step={name === "chromaticAberration" && key === "offset" ? 0.001 : 0.01}
                  onChange={(next) => change({ [name]: { ...item, [key]: next } })}
                  onCommit={onCommit}
                />
              ))}
          </div>
        );
      })}
    </InspectorGroup>
  );
}

ThreeSceneEffects.propTypes = {
  effects: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
  defaultOpen: PropTypes.bool,
};
