import { t } from "../../../../shared/i18n.js";
import {
  getPresentationOwner,
  getPresentationPages,
} from "../../../presentation/presentation-document.js";
import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";

function ownerFor(store, id) {
  const owner = getPresentationOwner(store.nodes, id);
  if (!owner) throw new TypeError("Presentation not found");
  return owner;
}

export const getPresentationTool = createToolFromDescriptor(
  getWorkflowToolDefinition("get_presentation"),
  {
    async execute(args, context) {
      const store = context.getStore();
      const owner = ownerFor(store, args.ownerId);
      return {
        ownerId: owner.id,
        title: owner.data?.title ?? owner.data?.label ?? "",
        width: owner.data.presentation.width,
        height: owner.data.presentation.height,
        currentPageId:
          store.editingPresentationId === owner.id ? store.editingNodeId : null,
        pages: getPresentationPages(store.nodes, owner.id).map(
          (page, index) => ({
            pageId: page.id,
            index,
            title: page.data?.label ?? page.data?.title ?? "",
            notes: page.data?.presentationNotes ?? "",
            live: Boolean(store.editorBridges?.[page.id]),
          }),
        ),
      };
    },
    presentCall: () => ({
      title: t("presentation.agent.read"),
      icon: "layout",
    }),
    presentResult: () => ({
      title: t("presentation.agent.loaded"),
      status: "completed",
    }),
  },
);

export const editPresentationTool = createToolFromDescriptor(
  getWorkflowToolDefinition("edit_presentation"),
  {
    async execute(args, context) {
      const store = context.getStore();
      const owner = ownerFor(store, args.ownerId);
      const operation = { ...args.operation };
      if (operation.type === "duplicate") {
        const engine = store.editorBridges?.[operation.pageId]?.engine;
        await engine?.flushTransforms?.();
        await engine?.flushMasks?.();
        operation.doc =
          store.presentationSession?.ownerId === owner.id
            ? store.presentationSession.getPageDocument(operation.pageId)
            : engine?.serialise?.();
      }
      const result = store.editPresentationPage(owner.id, operation);
      if (!result) throw new Error("Presentation is read-only");
      return { ownerId: owner.id, ...result };
    },
    presentCall: () => ({
      title: t("presentation.agent.edit"),
      icon: "layout",
    }),
    presentResult: () => ({
      title: t("presentation.agent.edited"),
      status: "completed",
    }),
  },
);
