const ownerId = {
  type: "string",
  description:
    "Presentation owner node ID returned by create_multi_canvas or get_presentation; a member page ID also resolves its deck.",
};
const capabilities = {
  externalData: false,
  estimatedCost: 0,
  reversible: true,
  timeout: null,
};

export const PRESENTATION_TOOL_DEFINITIONS = {
  get_presentation: {
    name: "get_presentation",
    description:
      "Read a presentation's authoritative page order, stable page IDs, titles, notes and current page. Use create_multi_canvas with skill deck to create a deck. Read individual editable page layers with get_design_scene(pageId); use existing Design tools to edit page contents. Works from home and in the open editor.",
    params: {
      type: "object",
      properties: { ownerId },
      required: ["ownerId"],
      additionalProperties: false,
    },
    approvalLevel: "read-only",
    capabilities: { ...capabilities, mutates: false, idempotent: true },
    requires: { canvas: ["node:ownerId"] },
  },
  edit_presentation: {
    name: "edit_presentation",
    description:
      "Manage an existing presentation without opening another editor: add a blank page, duplicate a page including live unsaved content, reorder, rename, edit speaker notes or delete a page. index is zero-based destination; omitted add index appends. Deleting the last page is refused. Content edits use the returned pageId with Design tools. No generation or credits are consumed.",
    params: {
      type: "object",
      properties: {
        ownerId,
        operation: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["add", "duplicate", "move", "delete", "rename", "notes"],
            },
            pageId: { type: "string" },
            index: { type: "integer", minimum: 0 },
            title: { type: "string" },
            notes: { type: "string" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
      required: ["ownerId", "operation"],
      additionalProperties: false,
    },
    approvalLevel: "canvas-mutation",
    capabilities: { ...capabilities, mutates: true, idempotent: false },
    requires: { canvas: ["node:ownerId"] },
  },
};
