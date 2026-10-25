import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { BOOLEAN_OPERATIONS } from "../../editor/scene_model.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";

export default function SelectedNodeActions({
  object,
  selectedNodes = [],
  engine,
}) {
  const { t } = useI18n();
  if (!object?.id || !engine) return null;
  const nodes = selectedNodes.length ? selectedNodes : [object];
  const canCombine = nodes.length > 1 && Boolean(engine.canCombineSelection?.());
  // Group / Ungroup / boolean rows are the only content; with none of them the
  // section would be a bare heading, so it renders nothing.
  if (nodes.length <= 1 && object.kind !== "group") return null;
  return (
    <StaticSection title={t("editor.layer.title")}>
      <div className="grid grid-cols-2 gap-1.5">
        {nodes.length > 1 ? (
          <button
            type="button"
            data-testid="editor-taskbar-group"
            onClick={() => engine.groupSelection?.()}
            className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
          >
            {t("editor.taskbar.group")}
          </button>
        ) : object.kind === "group" ? (
          <button
            type="button"
            data-testid="editor-taskbar-ungroup"
            onClick={() => engine.ungroupSelection?.()}
            className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
          >
            {t("editor.taskbar.ungroup")}
          </button>
        ) : null}
        {canCombine
          ? BOOLEAN_OPERATIONS.map((operation) => (
              <button
                key={operation}
                type="button"
                data-testid={`editor-taskbar-boolean-${operation}`}
                onClick={() => engine.combineSelected?.(operation)}
                className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
              >
                {t(`editor.props.combine.${operation}`)}
              </button>
            ))
          : null}
      </div>
    </StaticSection>
  );
}

SelectedNodeActions.propTypes = {
  object: PropTypes.object,
  selectedNodes: PropTypes.arrayOf(PropTypes.object),
  engine: PropTypes.object,
};
