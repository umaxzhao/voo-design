/**
 * Component-instance controls: source component (swap) and the override reset
 * matrix (text / fill / stroke / effects / opacity / visibility / all).
 * Every action is one document commit, like the rest of the panel.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
import FlatSelect from "../flat_select.jsx";
import {
  clearAllOverrides,
  clearOverrideFields,
  overriddenFields,
  swapInstanceSource,
} from "../../editor/instance-overrides.js";

const GROUPS = [
  ["text", "editor.props.resetText", ["text", "fontSize", "fontWeight"]],
  ["fill", "editor.props.resetFill", ["fill", "fillOpacity"]],
  ["stroke", "editor.props.resetStroke", ["stroke", "strokeWidth", "strokeOpacity"]],
  ["effects", "editor.props.resetEffects", ["effects"]],
  ["opacity", "editor.props.resetOpacity", ["opacity"]],
  ["visibility", "editor.props.resetVisibility", ["visible"]],
];

export default function InstanceSection({ object, engine }) {
  const { t } = useI18n();
  const doc = engine?.getDocument?.();
  if (!doc || object?.kind !== "canvasInstance") return null;
  const components = doc.components ?? {};
  const current = components[object.sourceCanvasId] ?? null;
  const options = Object.entries(components).map(([id, component]) => ({
    value: id,
    label: component?.name || component?.canvasId || id,
  }));
  if (object.sourceCanvasId && !options.some((entry) => entry.value === object.sourceCanvasId)) {
    options.push({
      value: object.sourceCanvasId,
      label: current?.name || object.sourceCanvasId,
    });
  }
  const fields = overriddenFields(object.instance ?? {});
  const overrideRows = GROUPS.filter(([, , groupFields]) =>
    groupFields.some((field) => fields.has(field)),
  );
  const commit = (nodePatch) => {
    engine.setDoc(
      {
        ...doc,
        nodes: doc.nodes.map((node) =>
          node.id === object.id ? { ...node, ...nodePatch } : node,
        ),
      },
      { name: t("editor.history.entry.action") },
    );
  };
  const reset = (groupFields) =>
    commit({ instance: clearOverrideFields(object.instance ?? {}, groupFields) });

  return (
    <StaticSection title={t("editor.props.instance")} storageKey="instance">
      <div className="flex flex-col gap-1.5">
        <div className={sectionRowClass}>
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-tight text-neutral-400">
            {t("editor.props.instanceSource")}
          </span>
          <FlatSelect
            value={object.sourceCanvasId ?? ""}
            onChange={(next) =>
              commit(swapInstanceSource(object, next))
            }
            label={t("editor.props.swapInstance")}
            options={options}
            className="min-w-0 flex-1"
            triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100"
            widthClass="w-full"
          />
        </div>

        {object.sourceCanvasId ? (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("voo:open-canvas-source", {
                  detail: {
                    canvasId: object.sourceCanvasId,
                    instanceId: object.id,
                  },
                }),
              )
            }
            className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
          >
            {t("editor.props.goToMainComponent")}
          </button>
        ) : null}

        {components[object.sourceCanvasId]?.description ? (
          <p className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-[10px] leading-4 text-neutral-400">
            {components[object.sourceCanvasId].description}
          </p>
        ) : null}

        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400">
            {t("editor.props.instanceOverrides")}
          </span>
          {overrideRows.length ? (
            <button
              type="button"
              onClick={() => commit({ instance: clearAllOverrides(object.instance ?? {}) })}
              className="text-[9px] font-mono text-neutral-500 transition-colors hover:text-white"
            >
              {t("editor.props.resetAllOverrides")}
            </button>
          ) : null}
        </div>
        {overrideRows.length ? (
          <div className="grid grid-cols-2 gap-1.5">
            {overrideRows.map(([key, labelKey, groupFields]) => (
              <button
                key={key}
                type="button"
                onClick={() => reset(groupFields)}
                className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-0.5 text-[10px] leading-4 text-neutral-400">
            {t("editor.props.noOverrides")}
          </p>
        )}
      </div>
    </StaticSection>
  );
}

InstanceSection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
};
