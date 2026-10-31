import PropTypes from "prop-types";
import { Layers, X } from "lucide-react";
import { IconFrame } from "../../icons.jsx";
import { contextLabel } from "./selection_context.js";

/** One compact attachment inside the composer, including multi-selection. */
export default function AgentContextChip({ context, onDetach, t }) {
  if (!context) return null;
  const isSingleFrame = (context.selection?.length ?? 1) === 1
    && ["frame", "artboard"].includes(context.selection?.[0]?.kind ?? context.kind);
  const ContextIcon = isSingleFrame ? IconFrame : Layers;
  const names = context.selection
    ?.map((node) => node.name || node.nodeId)
    .join(", ");
  return (
    <div
      className="mb-2 flex min-w-0 items-center gap-1.5"
      data-testid="agent-context-badge"
    >
      <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300">
        <ContextIcon size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate" title={names || context.name}>
          @{contextLabel(context, t)}
        </span>
        <button
          type="button"
          data-testid="agent-context-detach"
          onClick={onDetach}
          aria-label={t("agent.panel.removeContext")}
          className="flex size-5 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
AgentContextChip.propTypes = {
  context: PropTypes.object,
  onDetach: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
