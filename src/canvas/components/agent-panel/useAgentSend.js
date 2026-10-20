import { useCallback } from "react";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { captureAgentBrief } from "./agent-brief.js";
import {
  formatAttachmentsContext,
  getNodeDisplayName,
  getNodeImageDataUrl,
} from "./agentNodeHelpers.js";
import { HANDLE } from "../../nodes/types.js";
import { withCreationTypeContext } from "./creation-types.js";
import { captureLayerImage } from "../../editor/layer-image-edit.js";
import {
  editorRequestError,
  getEditorRequestTarget,
  isEditorRequestTargetCurrent,
  withEditorRequestContext,
} from "./editor-request-intent.js";
import { loadSelectedSkills, withSelectedSkills } from "./skill-invocation.js";
import { captureLayoutReference } from "../../store/layout_reference.js";

export function useAgentSend({
  inputText,
  setInputText,
  skillCatalog = "",
  selectedSkillIds = [],
  setSelectedSkillIds = () => {},
  isRunning,
  referenceImages,
  setReferenceImages,
  canvasReference,
  setCanvasReference = () => {},
  setRefImageError,
  selectedNodes,
  sendMessage,
  agentNodeId = null,
  creationType = null,
  editorIntent = null,
  t,
}) {
  const handleSend = useCallback(
    async (text) => {
      const trimmed = (text ?? inputText).trim();
      if ((!trimmed && selectedSkillIds.length === 0) || isRunning) return;
      // Capture the page and layer IDs before image decoding or storage awaits.
      // A changed UI selection must never silently become this turn's target.
      const target = editorIntent
        ? getEditorRequestTarget(useWorkflowStore.getState())
        : null;
      const targetError = editorIntent
        ? editorRequestError(target, editorIntent)
        : null;
      if (targetError) {
        setRefImageError(t(targetError));
        return;
      }
      // Only await when a Skill is attached: an extra await on every send
      // would let the attachment storage below start a tick later.
      let loadedSkills = [];
      if (selectedSkillIds.length > 0) {
        try {
          loadedSkills = await loadSelectedSkills(selectedSkillIds);
        } catch {
          setRefImageError(t("agent.skillUnavailable"));
          return;
        }
      }
      const images = referenceImages;
      setRefImageError(null);

      // The first message in a bound Agent Gen session becomes the node's
      // standing brief, so "Run" has an objective even before the model writes
      // one. Later messages never overwrite an existing brief.
      if (agentNodeId && trimmed) {
        captureAgentBrief(useWorkflowStore.getState(), agentNodeId, trimmed);
      }

      let messageText = trimmed;
      if (images.length > 0) {
        const store = useWorkflowStore.getState();
        const attached = [];
        for (let i = 0; i < images.length; i += 1) {
          try {
            const position = { x: 180 + i * 300, y: 180 };
            const nodeId = await store.addExternalImageNode(
              images[i].url,
              images[i].name,
              position,
            );
            attached.push(`"${images[i].name}" → node ${nodeId}`);
          } catch (error) {
            console.warn("Agent reference image could not be stored", error);
            setRefImageError(t("agent.editorIntent.referenceFailed"));
            return;
          }
        }
        if (attached.length > 0) {
          messageText = `${trimmed}\n\n[Reference images attached to the canvas: ${attached.join("; ")}]`;
        }
      }

      if (selectedNodes.length > 0) {
        const attachmentsStr = formatAttachmentsContext(selectedNodes, t);
        if (attachmentsStr) {
          messageText = `${messageText}\n\n${attachmentsStr}`;
        }
      }

      const modelImages = [...images];
      if (canvasReference) {
        try {
          const reference = await captureLayoutReference(
            useWorkflowStore.getState(),
            canvasReference.nodeId,
          );
          messageText += `\n\n[Design reference node: ${reference.nodeId}]`;
          if (reference.summary) {
            messageText += `\n[Reference structure: ${reference.summary}]`;
          }
          if (reference.image) {
            modelImages.push({
              url: reference.image,
              name: canvasReference.name,
            });
          }
        } catch {
          setRefImageError(t("agent.editorIntent.referenceFailed"));
          return;
        }
      }
      if (editorIntent === "layer") {
        try {
          for (const layer of target.selectedLayers) {
            if (layer.kind !== "image") continue;
            const source = captureLayerImage(target.engine, layer.id);
            modelImages.push({
              url: source.dataUrl,
              name: t("agent.editorIntent.layerReference", {
                name: layer.name || t("agent.editorIntent.unnamedLayer"),
              }),
            });
          }
        } catch (error) {
          console.warn("Selected editor layer could not be read", error);
          setRefImageError(
            t(
              error?.message === "layerMaskNotReady"
                ? "error.layerMaskNotReady"
                : "agent.editorIntent.referenceFailed",
            ),
          );
          return;
        }
      }
      const attachedNodeIds = new Set();
      for (const node of selectedNodes) {
        attachedNodeIds.add(node.id);
        let url = null;
        try {
          url = await getNodeImageDataUrl(node);
        } catch (error) {
          console.warn("selected node image unreadable", node.id, error);
        }
        if (url) {
          modelImages.push({ url, name: getNodeDisplayName(node, t) });
        }
      }

      if (agentNodeId) {
        const store = useWorkflowStore.getState();
        const nodesById = new Map(store.nodes.map((node) => [node.id, node]));
        for (const edge of store.edges) {
          if (
            edge.target !== agentNodeId ||
            edge.sourceHandle !== HANDLE.IMAGE ||
            attachedNodeIds.has(edge.source)
          ) {
            continue;
          }
          const source = nodesById.get(edge.source);
          if (!source) continue;
          attachedNodeIds.add(source.id);
          let url;
          try {
            url = await getNodeImageDataUrl(source);
          } catch {
            setInputText(trimmed);
            setReferenceImages(images);
            setRefImageError(
              t("agent.connectedImageUnreadable", {
                name: getNodeDisplayName(source, t),
              }),
            );
            return;
          }
          if (url) {
            modelImages.push({ url, name: getNodeDisplayName(source, t) });
          }
        }
      }

      if (
        editorIntent &&
        !isEditorRequestTargetCurrent(
          target,
          useWorkflowStore.getState(),
          editorIntent,
        )
      ) {
        setRefImageError(t("agent.editorIntent.targetChanged"));
        return;
      }
      const contextualMessage = withSelectedSkills(messageText, loadedSkills);
      const requestText = editorIntent
        ? withEditorRequestContext(
            contextualMessage,
            editorIntent,
            creationType,
            target,
          )
        : withCreationTypeContext(contextualMessage, creationType);
      setInputText("");
      setSelectedSkillIds([]);
      setReferenceImages([]);
      setCanvasReference(null);
      sendMessage(requestText, {
        images: modelImages,
        skillCatalog,
        displayText: [...selectedSkillIds.map((id) => `@${id}`), trimmed]
          .join("\n")
          .trim(),
      });
    },
    [
      inputText,
      selectedSkillIds,
      setSelectedSkillIds,
      skillCatalog,
      isRunning,
      referenceImages,
      canvasReference,
      selectedNodes,
      sendMessage,
      setInputText,
      setReferenceImages,
      setCanvasReference,
      setRefImageError,
      agentNodeId,
      creationType,
      editorIntent,
      t,
    ],
  );

  return { handleSend };
}
