import PropTypes from "prop-types";
import { useState } from "react";
import {
  ICON_STROKE_WIDTH,
  IconAdd,
  IconRefresh,
  IconTrash,
} from "../../icons.jsx";
import {
  addNodeState,
  BASE_STATE_ID,
  captureStateValues,
  getNodeStates,
  recaptureNodeState,
  removeNodeState,
  renameNodeState,
  stateValuesPatch,
} from "../../editor/node_states.js";
import { InspectorGroup } from "./three-inspector.jsx";

const EPSILON = 0.001;
const ROW_BUTTON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-100";

const samePose = (a, b) =>
  Object.keys(a).every((key) => Math.abs(a[key] - b[key]) < EPSILON);

/**
 * Named poses for the selected object. Clicking a state moves the object into
 * it; the refresh button re-captures the state from the object as it is now.
 */
export default function ThreeNodeStates({ node, onPatchNode, onCommit, t }) {
  const [editingId, setEditingId] = useState(null);
  const states = getNodeStates(node);
  const current = captureStateValues(node);
  const write = (next) => {
    onPatchNode?.(node.id, { states: next });
    onCommit?.();
  };
  return (
    <InspectorGroup
      // Remount once the first state exists so the group opens on it.
      key={states.length > 0 ? "with-states" : "empty"}
      title={t("editor.three.states")}
      defaultOpen={states.length > 0}
      testId="editor-three-states-group"
      extra={
        <button
          type="button"
          data-testid="editor-three-state-add"
          aria-label={t("editor.three.addState")}
          title={t("editor.three.addState")}
          className={ROW_BUTTON}
          onClick={() =>
            write(
              addNodeState(node, {
                id: crypto.randomUUID(),
                name: t(
                  states.length
                    ? "editor.three.state"
                    : "editor.three.baseState",
                ),
              }),
            )
          }
        >
          <IconAdd size={14} strokeWidth={ICON_STROKE_WIDTH} />
        </button>
      }
    >
      {states.length === 0 ? (
        <p className="px-1.5 py-1 text-[10px] text-neutral-500">
          {t("editor.three.noStates")}
        </p>
      ) : (
        states.map((state) => {
          const active = samePose(state.values, current);
          const base = state.id === BASE_STATE_ID;
          return (
            <div
              key={state.id}
              data-testid="editor-three-state-row"
              data-active={active}
              className={`flex min-h-7 items-center gap-1 rounded-xl px-1.5 text-[11px] ${
                active
                  ? "bg-[#E5B2FF]/10 text-[#eed0ff]"
                  : "bg-neutral-800 text-neutral-300"
              }`}
            >
              {editingId === state.id ? (
                <input
                  autoFocus
                  aria-label={t("editor.three.renameState")}
                  defaultValue={state.name}
                  className="h-6 min-w-0 flex-1 rounded-lg bg-neutral-900 px-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") setEditingId(null);
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim();
                    setEditingId(null);
                    if (name && name !== state.name)
                      write(renameNodeState(states, state.id, name));
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-1.5 text-left"
                  onClick={() => {
                    onPatchNode?.(node.id, stateValuesPatch(state));
                    onCommit?.();
                  }}
                  onDoubleClick={() => setEditingId(state.id)}
                >
                  {state.name}
                </button>
              )}
              {base ? null : (
                <>
                  <button
                    type="button"
                    aria-label={t("editor.three.updateState")}
                    title={t("editor.three.updateState")}
                    className={ROW_BUTTON}
                    onClick={() =>
                      write(recaptureNodeState(states, state.id, node))
                    }
                  >
                    <IconRefresh size={12} strokeWidth={ICON_STROKE_WIDTH} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("editor.three.deleteState")}
                    title={t("editor.three.deleteState")}
                    className={ROW_BUTTON}
                    onClick={() => write(removeNodeState(states, state.id))}
                  >
                    <IconTrash size={12} strokeWidth={ICON_STROKE_WIDTH} />
                  </button>
                </>
              )}
            </div>
          );
        })
      )}
    </InspectorGroup>
  );
}

ThreeNodeStates.propTypes = {
  node: PropTypes.object.isRequired,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
