import {
  addColorVariable, bindColorVariable, updateColorVariable,
} from "../../editor/scene_color_variables.js";
import { createVariablesPanelActions } from "../../editor/scene_variables.js";
import { createStylePanelActions } from "../../editor/scene_styles.js";

/** Document-scoped library actions retain the current property target and history name. */
export function createEditorPropertyLibraries({ engine, doc, propertyObject, t }) {
  const colorVariableActions = propertyObject
    ? {
        documentId: doc?.canvasId,
        variables: doc?.colorVariables ?? [],
        // Variables v2 wiring: collections, modes and typed variables are
        // document-scoped, so every action commits the focused page once.
        variablesV2: doc?.variablesV2 ?? null,
        variableActions: createVariablesPanelActions({
          getDocument: () => engine.getDocument(),
          commit: (next, options) => engine.setDoc(next, options),
          getNodeId: () => propertyObject.id,
          historyName: "editor.history.entry.variables",
        }),
        create: () => {
          const current = engine.getDocument();
          const id = crypto.randomUUID();
          const name = t("editor.variables.defaultName", {
            index: (current.colorVariables?.length ?? 0) + 1,
          });
          const next = addColorVariable(current, {
            id,
            name,
            value: propertyObject.fill,
          });
          engine.setDoc(bindColorVariable(next, propertyObject.id, id));
        },
        bind: (id) =>
          engine.setDoc(
            bindColorVariable(engine.getDocument(), propertyObject.id, id),
          ),
        update: (id, patch) =>
          engine.setDoc(updateColorVariable(engine.getDocument(), id, patch)),
      }
    : null;
  // Named styles: document-scoped paint/text/effect library. Actions commit the
  // focused page once (one undo entry), mirroring the variables wiring above.
  const styleActions = propertyObject
    ? {
        styles: doc?.styles ?? null,
        actions: createStylePanelActions({
          getDocument: () => engine.getDocument(),
          commit: (next, options) => engine.setDoc(next, options),
          getNodeId: () => propertyObject.id,
          historyName: "editor.history.entry.styles",
        }),
      }
    : null;
  return { colorVariableActions, styleActions };
}
