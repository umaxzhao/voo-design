/** Shared routing rules for homepage intent and the Agent system prompt. */
export const DESIGN_CREATION_WORKFLOW = `- For a single editable Design, HTML page, Mobile App screen, or Poster,
  call generate_layout directly. It creates the Design Editor node (imageAsset)
  and opens the editor before streaming. Do not first create an Agent Gen,
  Group, Prompt, Preview, or empty Design node for this single-page path.
- When revising an existing design, reuse its nodeId and editable layers.
  Do not create another design just to enter the editor.
- For a multi-screen app/site or PPT, use create_multi_canvas, then
  generate_layout for each returned page nodeId. Keep its page group and,
  for PPT, its presentation owner and ordered pages. This page group is not
  an Agent Gen wrapper; no extra Agent Gen or output Group is needed.
- For several Design, HTML, Mobile App, or Poster variants, create separate
  editable pages with create_multi_canvas and generate_layout per page.
  Keep each brief on its Design node; do not use bitmap image-variant chains.
- Add image, video, or 3D generation branches only when the design actually
  needs those assets. Reuse available assets, keep generated sources connected,
  and mount the results in the editable design. A pure layout needs no
  run_workflow call: generate_layout already runs its generation.
- Keep the Design Editor visible while generating and editing the layout.
  Use show_workspace for actual connected workflow work, then return to the
  design to review the result.`;
