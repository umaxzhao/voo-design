/** A closed editor must offer a valid read before choosing or creating a page. */
export function createEditorRecoverySuggestion() {
  return {
    tool: "list_nodes",
    args: {},
    note: "Use show_workspace({surface:'editor',nodeId}) for an existing imageAsset, edit_generated_image({sourceNodeId,open:true}) for a generated image, or create_node({type:'imageAsset'}) for a new design. Open the chosen page and wait for editor readiness before retrying.",
  };
}
