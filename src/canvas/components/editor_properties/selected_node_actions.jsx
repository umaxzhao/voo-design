import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { BOOLEAN_OPERATIONS } from "../../editor/scene_model.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
import EditorContextualAiInput from "../editor_contextual_ai_input.jsx";

const ACTIONS = [
  ["duplicate", "duplicateSelected"],
  ["lock", "toggleLockNode"],
  ["visibility", "visibility"],
  ["bringForward", "bringForward"],
  ["sendBackward", "sendBackward"],
  ["delete", "deleteSelected"],
];

export default function SelectedNodeActions({
  object,
  selectedNodes = [],
  engine,
  onCreateComponent,
  onDetachInstance,
}) {
  const { t } = useI18n();
  const [aiOpen, setAiOpen] = useState(false);
  if (!object?.id || !engine) return null;
  const nodes = selectedNodes.length ? selectedNodes : [object];
  const ids = nodes.map((node) => node.id).filter(Boolean);
  const run = (action) => {
    if (action === "duplicateSelected") engine.duplicateSelected?.();
    if (action === "toggleLockNode") ids.forEach((id) => engine.toggleLockNode?.(id));
    if (action === "visibility") {
      const visible = object.visible === false;
      ids.forEach((id) => engine.updateNode?.(id, { visible }));
    }
    if (action === "deleteSelected") engine.deleteSelected?.();
    if (action === "bringForward") ids.forEach((id) => engine.reorderNode?.(id, 1));
    if (action === "sendBackward") ids.forEach((id) => engine.reorderNode?.(id, -1));
  };

  return (
    <StaticSection title={t("editor.layer.title")}>
      <div className="grid grid-cols-2 gap-1.5">
        {object.kind === "canvasInstance" && onDetachInstance ? (
          <button
            type="button"
            data-testid="editor-taskbar-detach-instance"
            onClick={() => onDetachInstance(object.id)}
            className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
          >
            {t("editor.component.detach")}
          </button>
        ) : onCreateComponent ? (
          <button
            type="button"
            data-testid="editor-taskbar-create-component"
            onClick={onCreateComponent}
            className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
          >
            {t("editor.component.create")}
          </button>
        ) : null}
        {ACTIONS.map(([id, action]) => {
          const labelKey =
            id === "lock"
              ? `editor.taskbar.${object.locked ? "unlock" : "lock"}`
              : id === "visibility"
                ? `editor.taskbar.${object.visible === false ? "show" : "hide"}`
                : `editor.taskbar.${id}`;
          const testId =
            id === "lock"
              ? object.locked
                ? "unlock"
                : "lock"
              : id === "visibility"
                ? object.visible === false
                  ? "show"
                  : "hide"
                : id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`editor-taskbar-${testId}`}
              aria-label={t(labelKey)}
              onClick={() => run(action)}
              className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
            >
              {t(labelKey)}
            </button>
          );
        })}
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
        {nodes.length > 1 && engine.canCombineSelection?.()
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
      <button
        type="button"
        data-testid="editor-taskbar-ai-sparkle"
        aria-expanded={aiOpen}
        onClick={() => setAiOpen((open) => !open)}
        className={`${sectionRowClass} mt-1.5 w-full justify-center text-[10px] text-neutral-300`}
      >
        {t("editor.taskbar.askAgent")}
      </button>
      {aiOpen ? (
        <EditorContextualAiInput
          selectedNode={object}
          placeholder={t("editor.taskbar.askPlaceholder")}
          inputTestId="editor-properties-ai-input"
          submitTestId="editor-properties-ai-submit"
          onClose={() => setAiOpen(false)}
        />
      ) : null}
    </StaticSection>
  );
}

SelectedNodeActions.propTypes = {
  object: PropTypes.object,
  selectedNodes: PropTypes.arrayOf(PropTypes.object),
  engine: PropTypes.object,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
};
