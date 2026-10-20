import PropTypes from "prop-types";
import { createContext, useContext, useEffect, useState } from "react";
import { usePropertyCommit } from "../editor_properties/use_property_commit.js";
import { useI18n } from "../../use_i18n.js";
import {
  editMotionField,
  motionFieldState,
  toggleMotionField,
} from "./motion-field-actions.js";

const MotionFieldContext = createContext(null);

export function MotionFieldProvider({
  engine,
  enabled = true,
  nodeId,
  children,
}) {
  const { t } = useI18n();
  const [error, setError] = useState(null);
  const perform = (action) => {
    try {
      setError(null);
      return action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("editor.motion.actionFailed"),
      );
      return undefined;
    }
  };
  const { edit, commitNow } = usePropertyCommit({
    onMutate: ({ property, value }) =>
      perform(() => editMotionField(engine, nodeId, property, value)),
    onCommit: () => engine.commit("editor.history.entry.layer"),
  });
  // Flush before Motion or the selection changes; the engine stays available
  // when the provider becomes inactive so a pending gesture cannot lose undo.
  useEffect(() => () => commitNow(), [engine, enabled, nodeId, commitNow]);
  return (
    <MotionFieldContext.Provider
      value={
        enabled && engine && nodeId
          ? {
              engine,
              nodeId,
              edit,
              commitNow,
              toggle: (property) =>
                perform(() => {
                  commitNow();
                  toggleMotionField(engine, nodeId, property);
                }),
            }
          : null
      }
    >
      {children}
      {error ? (
        <p role="alert" className="px-2 py-1 text-[11px] text-rose-400">
          {error}
        </p>
      ) : null}
    </MotionFieldContext.Provider>
  );
}

MotionFieldProvider.propTypes = {
  engine: PropTypes.object,
  enabled: PropTypes.bool,
  nodeId: PropTypes.string,
  children: PropTypes.node,
};

export function useMotionField(
  property,
  value,
  onChange,
  onCommit,
  adapter = null,
) {
  const context = useContext(MotionFieldContext);
  if (!context || !property) return { value, onChange, onCommit, motion: null };
  const state = motionFieldState(context.engine, context.nodeId, property);
  return {
    value:
      state.value === null
        ? value
        : (adapter?.toDisplay(state.value, state.evaluated) ?? state.value),
    onChange: (next) => {
      // Unanimated fields retain their original geometry/model write path.
      const current = motionFieldState(
        context.engine,
        context.nodeId,
        property,
      );
      if (current.track) {
        context.edit({
          property,
          value: adapter?.fromDisplay(next, current.evaluated) ?? next,
        });
      } else {
        onChange(next);
      }
    },
    onCommit: () => {
      context.commitNow();
      onCommit?.();
    },
    motion: {
      active: Boolean(state.keyframe),
      animated: Boolean(state.track),
      toggle: () => context.toggle(property),
    },
  };
}
