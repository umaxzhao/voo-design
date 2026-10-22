import PropTypes from "prop-types";
import {
  ICON_STROKE_WIDTH,
  IconEye,
  IconEyeOff,
  IconRefresh,
} from "../icons.jsx";
import {
  clearAllOverrides,
  clearNodeOverride,
  getNodeOverride,
  hasNodeOverride,
  hasOverrides,
  overridableNodes,
  setNodeOverride,
} from "../editor/instance-overrides.js";
import { ColorRow, InspectorGroup } from "./inspector_primitives.jsx";

const ICON_BUTTON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-100 disabled:opacity-40";
const TEXT_FIELD =
  "h-8 w-full min-w-0 rounded-xl bg-[#222222] px-2 text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

/**
 * Text, colour and visibility overrides for one instance of a component.
 * `onPreview` writes while a value is being typed or dragged, `onCommit`
 * closes the history entry, `onPatch` is for one-shot changes.
 */
export default function EditorInstanceOverrides({
  sourceDoc,
  instance,
  onPreview,
  onCommit,
  onPatch,
  t,
}) {
  const rows = overridableNodes(sourceDoc);
  if (rows.length === 0) return null;
  const preview = (nodeId, patch) =>
    onPreview({ instance: setNodeOverride(instance, nodeId, patch) });
  return (
    <InspectorGroup
      title={t("editor.instance.overrides")}
      testId="editor-instance-overrides-group"
      extra={
        hasOverrides(instance) ? (
          <button
            type="button"
            data-testid="editor-instance-reset-overrides"
            aria-label={t("editor.instance.resetOverrides")}
            title={t("editor.instance.resetOverrides")}
            className={ICON_BUTTON}
            onClick={() => onPatch({ instance: clearAllOverrides(instance) })}
          >
            <IconRefresh size={12} strokeWidth={ICON_STROKE_WIDTH} />
          </button>
        ) : null
      }
    >
      <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
        {rows.map(({ node, support }) => {
          const override = getNodeOverride(instance, node.id);
          const overridden = hasNodeOverride(instance, node.id);
          const visible = override.visible ?? node.visible !== false;
          const label = node.name || t("editor.motion.unnamedObject");
          return (
            <div
              key={node.id}
              data-testid="editor-instance-override-row"
              data-node-id={node.id}
              data-overridden={overridden}
              className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] p-1.5"
            >
              <div className="flex items-center gap-1">
                <span
                  className={`min-w-0 flex-1 truncate text-[11px] ${
                    overridden ? "text-[#eed0ff]" : "text-neutral-300"
                  }`}
                >
                  {label}
                </span>
                <span
                  data-testid="editor-instance-override-status"
                  className={`shrink-0 text-[9px] ${
                    overridden ? "text-[#eed0ff]" : "text-neutral-500"
                  }`}
                >
                  {t(
                    overridden
                      ? "editor.instance.localOverride"
                      : "editor.instance.fromMaster",
                  )}
                </span>
                <button
                  type="button"
                  data-testid="editor-instance-override-visible"
                  aria-label={t("editor.instance.overrideVisible")}
                  title={t("editor.instance.overrideVisible")}
                  aria-pressed={visible}
                  className={ICON_BUTTON}
                  onClick={() =>
                    onPatch({
                      instance: setNodeOverride(instance, node.id, {
                        // Back to what the component says removes the override.
                        visible:
                          visible === (node.visible !== false)
                            ? !visible
                            : null,
                      }),
                    })
                  }
                >
                  {visible ? (
                    <IconEye size={13} strokeWidth={ICON_STROKE_WIDTH} />
                  ) : (
                    <IconEyeOff size={13} strokeWidth={ICON_STROKE_WIDTH} />
                  )}
                </button>
                {overridden ? (
                  <button
                    type="button"
                    data-testid="editor-instance-override-reset"
                    aria-label={t("editor.instance.resetOverride")}
                    title={t("editor.instance.resetOverride")}
                    className={ICON_BUTTON}
                    onClick={() =>
                      onPatch({
                        instance: clearNodeOverride(instance, node.id),
                      })
                    }
                  >
                    <IconRefresh size={12} strokeWidth={ICON_STROKE_WIDTH} />
                  </button>
                ) : null}
              </div>
              {support.text ? (
                <input
                  type="text"
                  data-testid="editor-instance-override-text"
                  aria-label={t("editor.instance.overrideText")}
                  value={override.text ?? node.text ?? ""}
                  onChange={(event) =>
                    preview(node.id, {
                      text:
                        event.target.value === (node.text ?? "")
                          ? null
                          : event.target.value,
                    })
                  }
                  onBlur={onCommit}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className={TEXT_FIELD}
                />
              ) : null}
              {support.fill ? (
                <ColorRow
                  label={t("editor.instance.overrideFill")}
                  value={override.fill ?? node.fill}
                  onChange={(fill) => preview(node.id, { fill })}
                  onCommit={onCommit}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </InspectorGroup>
  );
}

EditorInstanceOverrides.propTypes = {
  sourceDoc: PropTypes.object,
  instance: PropTypes.object.isRequired,
  onPreview: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
  onPatch: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
