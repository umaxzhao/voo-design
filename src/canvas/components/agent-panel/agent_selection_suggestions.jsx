import PropTypes from "prop-types";

const SUGGESTIONS = {
  image: ["referenceImage", "removeBackground", "restyle"],
  frame: ["redesign", "layout", "palette"],
  text: ["rewrite", "typography", "translate"],
  shape: ["palette", "restyle", "layout"],
  mixed: ["layout", "unifyStyle", "redesign"],
};

/** Homogeneous multi-selection keeps its type; mixed selections use group edits. */
export function selectionSuggestions(context) {
  if (!context) return [];
  const nodes = context.selection?.length ? context.selection : [context];
  const types = new Set(
    nodes.map((node) => {
      const kind = node.isFrame ? "frame" : node.kind || node.layerType;
      if (["frame", "artboard", "group"].includes(kind)) return "frame";
      if (
        ["rect", "ellipse", "path", "boolean", "shape", "line"].includes(kind)
      )
        return "shape";
      return kind;
    }),
  );
  return (
    SUGGESTIONS[types.size === 1 ? [...types][0] : "mixed"] ?? SUGGESTIONS.mixed
  );
}

/** Preserve an existing draft and avoid adding the same suggestion twice. */
export function appendSuggestion(input, prompt) {
  if (!input.trim()) return prompt;
  return input.includes(prompt) ? input : `${input.trimEnd()}\n${prompt}`;
}

export default function AgentSelectionSuggestions({
  context,
  busy,
  onPick,
  t,
}) {
  const suggestions = selectionSuggestions(context);
  if (!suggestions.length) return null;
  return (
    <div
      data-testid="agent-selection-suggestions"
      aria-label={t("agent.panel.selectionSuggestions")}
      className="mx-3 mb-2 flex shrink-0 flex-wrap gap-1.5"
    >
      {suggestions.map((id) => (
        <button
          key={id}
          type="button"
          disabled={busy}
          data-testid={`agent-suggestion-${id}`}
          title={t(`agent.panel.guide.${id}.prompt`)}
          onClick={() => onPick(t(`agent.panel.guide.${id}.prompt`))}
          className="min-h-8 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 max-sm:min-h-12"
        >
          {t(`agent.panel.guide.${id}.label`)}
        </button>
      ))}
    </div>
  );
}
AgentSelectionSuggestions.propTypes = {
  context: PropTypes.object,
  busy: PropTypes.bool,
  onPick: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
