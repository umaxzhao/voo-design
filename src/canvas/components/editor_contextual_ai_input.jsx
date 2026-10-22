import PropTypes from "prop-types";
import { memo, useCallback, useMemo, useState } from "react";
import { IconSparkles, IconArrowUp, IconClose } from "../icons.jsx";
import { useDesignStore } from "../../store/design_store.js";

/**
 * Extracts normalized node context for Agent dispatch.
 * Conforms to: { nodeId, layerType, name, dimensions: { width, height, x, y }, imageAsset, textContent, badge }
 */
export function extractNodeContext(node) {
  if (!node) return null;

  const nodeId = node.id || "selection";
  const isFrame = Boolean(
    node.isFrame ||
      node.kind === "frame" ||
      node.kind === "artboard" ||
      (node.kind === "rect" && node.isFrame) ||
      node.type === "imageEditor"
  );

  let layerType = "layer";
  if (isFrame) {
    layerType = "frame";
  } else if (node.kind === "image") {
    layerType = "image";
  } else if (node.kind === "text") {
    layerType = "text";
  } else if (
    node.kind === "rect" ||
    node.kind === "ellipse" ||
    node.kind === "path" ||
    node.kind === "boolean"
  ) {
    layerType = "shape";
  } else if (node.kind) {
    layerType = node.kind;
  }

  const rawName =
    node.name ||
    node.label ||
    (isFrame
      ? "Frame"
      : layerType.charAt(0).toUpperCase() + layerType.slice(1));

  const dimensions = {
    x: Math.round(node.x ?? 0),
    y: Math.round(node.y ?? 0),
    width: Math.round(node.width ?? node.w ?? 0),
    height: Math.round(node.height ?? node.h ?? 0),
  };

  const imageAsset = node.url || node.src || node.imageId || node.assetId || null;
  const textContent = node.text || node.content || null;
  const badge = `@${rawName}`;

  return {
    nodeId,
    id: nodeId,
    layerType,
    kind: layerType,
    name: rawName,
    dimensions,
    width: dimensions.width,
    height: dimensions.height,
    x: dimensions.x,
    y: dimensions.y,
    imageAsset,
    imageUrl: imageAsset,
    textContent,
    text: textContent,
    badge,
  };
}

/**
 * Dispatches agent requests to Zustand store and custom DOM events.
 */
export function dispatchToAgent({
  prompt = "",
  intent = "",
  tool = null,
  context = null,
  autoSend = true,
}) {
  const normalizedPrompt = (prompt || intent || "").trim();
  const normalizedIntent = (intent || prompt || "").trim();

  const payload = {
    prompt: normalizedPrompt,
    intent: normalizedIntent,
    tool: tool || null,
    context: context || null,
    autoSend,
  };

  // 1. Dispatch into Zustand store if available
  try {
    const store = useDesignStore?.getState?.();
    if (store?.dispatchAgentIntent) {
      store.dispatchAgentIntent({
        prompt: normalizedPrompt,
        action: payload.tool || payload.intent || "custom",
        node: payload.context,
      });
    }
    if (store?.dispatchToAgent) {
      store.dispatchToAgent(payload);
    }
    if (store?.setAgentPanelOpen) {
      store.setAgentPanelOpen(true);
    }
    if (store?.setAgentOpen) {
      store.setAgentOpen(true);
    }
  } catch (_e) {
    // Graceful fallback for isolated test environments
  }

  // 2. Fire custom DOM events for maximum reliability
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-dispatch", { detail: payload })
    );
    window.dispatchEvent(
      new CustomEvent("voo:open-agent-panel", { detail: { context: payload.context } })
    );
    if (payload.prompt) {
      window.dispatchEvent(
        new CustomEvent("voo:agent-prompt", {
          detail: {
            prompt: payload.prompt,
            intent: payload.intent,
            tool: payload.tool,
            context: payload.context,
            autoSend,
          },
        })
      );
    }
  }

  return payload;
}

/**
 * Pen App styled contextual inline prompt input field.
 */
function EditorContextualAiInput({
  selectedNode = null,
  placeholder: customPlaceholder = null,
  onDispatch = null,
  onClose = null,
  autoFocus = true,
  className = "",
  inputTestId = "editor-contextual-ai-input",
  submitTestId = "editor-contextual-ai-submit",
}) {
  const [prompt, setPrompt] = useState("");

  const context = useMemo(
    () => extractNodeContext(selectedNode),
    [selectedNode]
  );

  const placeholder = useMemo(() => {
    if (customPlaceholder) return customPlaceholder;
    if (!context) return "Ask AI to edit selection...";

    const { layerType, name } = context;
    if (layerType === "image") {
      return `Ask AI to edit @${name}...`;
    }
    if (layerType === "text") {
      return `Ask AI to rewrite @${name}...`;
    }
    if (layerType === "frame") {
      return `Ask AI to layout @${name}...`;
    }
    if (layerType === "shape") {
      return `Ask AI to modify @${name}...`;
    }
    return `Ask AI to edit @${name}...`;
  }, [customPlaceholder, context]);

  const handleSubmit = useCallback(
    (e) => {
      if (e?.preventDefault) {
        e.preventDefault();
      }
      const trimmed = prompt.trim();
      if (!trimmed) return;

      if (onDispatch) {
        onDispatch(trimmed, context);
      } else {
        dispatchToAgent({
          prompt: trimmed,
          intent: trimmed,
          context,
          autoSend: true,
        });
      }
      setPrompt("");
      onClose?.();
    },
    [prompt, context, onDispatch, onClose]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit, onClose]
  );

  const canSubmit = prompt.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="editor-contextual-ai-form"
      className={`flex items-center gap-1.5 ${className}`}
    >
      <div className="relative flex items-center" data-testid="editor-contextual-ai-wrapper">
        <span className="pointer-events-none absolute left-2 text-[#E5B2FF]">
          <IconSparkles size={13} strokeWidth={1.5} />
        </span>
        <input
          type="text"
          autoFocus={autoFocus}
          data-testid={inputTestId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-6 w-36 sm:w-48 focus:w-56 rounded-full bg-white/[0.06] hover:bg-white/[0.08] focus:bg-white/[0.1] pl-7 pr-2.5 text-[10px] text-neutral-100 placeholder-neutral-400 border border-white/10 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-[#E5B2FF]/40 transition-all font-sans"
        />
      </div>

      <button
        type="submit"
        data-testid={submitTestId}
        aria-label="Send to AI Agent"
        disabled={!canSubmit}
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#E5B2FF] text-black hover:bg-[#eed0ff] disabled:opacity-30 disabled:hover:bg-[#E5B2FF] transition-colors"
      >
        <IconArrowUp size={11} strokeWidth={1.5} />
      </button>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI input"
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <IconClose size={11} />
        </button>
      ) : null}
    </form>
  );
}

EditorContextualAiInput.propTypes = {
  selectedNode: PropTypes.object,
  placeholder: PropTypes.string,
  onDispatch: PropTypes.func,
  onClose: PropTypes.func,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
  inputTestId: PropTypes.string,
  submitTestId: PropTypes.string,
};

export default memo(EditorContextualAiInput);
