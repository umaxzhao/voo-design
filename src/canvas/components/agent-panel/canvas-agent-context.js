/** Generation guidance for the current editable canvas, not a workflow selection. */
export function formatCanvasEditorScope(context) {
  const canvasType = context.canvasType ?? "design";
  const shared = `The captured canvas is ${context.nodeId} (${canvasType}). A per-turn [Editor intent] and [Editor target] identify the exact document and layer scope. Read get_design_scene first. Use explicit nodeId/designNodeId/targetNodeId in every edit; never replace the captured target with a later UI selection. Preserve unrelated layers and use undoable scene operations. A generation node is a backing source until its completed asset is inserted into the captured canvas.`;

  if (canvasType === "motion") {
    return `## Motion Canvas Request Scope\n${shared}\nThe document is an editable Motion canvas. Build animation with native layers, set_timeline and set_keyframe. Generate video assets with generate_video and run_workflow, then insert_media into this canvas. To reuse an existing canvas master, use insert_canvas_instance with sourceCanvasId and choose live or video playback. Video clips and animated layers may coexist. A completed source clip does not prove the whole Motion composition was rendered; claim final video export only after a rendering tool returns the video asset.`;
  }
  if (canvasType === "3d") {
    return `## 3D Canvas Request Scope\n${shared}\nThe document is a live 3D scene. Create editable LLM-directed box, sphere and plane meshes with edit_design_scene insert_mesh3d. For a generated textured model use generate_3d_model with the configured Tripo/Hunyuan route, run_workflow, then insert_media. Reuse an existing canvas master with insert_canvas_instance and sourceCanvasId. Keep transforms, camera, lighting and timeline intact. Two-dimensional layers occupy the XY plane and can coexist with models.`;
  }
  return `## Design Canvas Request Scope\n${shared}\nThe document can combine editable text and shapes, real video, live 3D and timeline animation. Generate external media with generate_video or generate_3d_model and run_workflow, then insert_media with a stable layerId. Use insert_mesh3d for editable geometric 3D. Embed an existing Motion or 3D canvas master with insert_canvas_instance and sourceCanvasId; choose fixed or fill sizing, live or rendered-video playback in instance settings. Use native design commands for editable layout. Only claim working interactions after preview verification. Do not flatten a mixed-media composition into a bitmap unless explicitly requested.`;
}

export function formatCanvasEditorGeneration(context) {
  const canvasType = context.canvasType ?? "design";
  if (canvasType === "motion") {
    return `## Motion Canvas Generation\nTarget ${context.nodeId}. Generate requested footage with generate_video, run_workflow, then edit_design_scene insert_media. Build native animation with editable layers plus set_timeline and set_keyframe. Reuse an existing canvas via insert_canvas_instance when requested. Keep existing content. Do not claim Remotion or final video rendering unless an available render tool actually completes it.`;
  }
  if (canvasType === "3d") {
    return `## 3D Canvas Generation\nTarget ${context.nodeId}. Choose the appropriate route for the brief: edit_design_scene insert_mesh3d for LLM-built editable primitives; generate_3d_model then run_workflow and insert_media for an actual generated model asset. Use insert_canvas_instance to embed an existing canvas master. Set geometry, material and spatial properties. Keep existing objects, and use keyframes for animation.`;
  }
  return `## Design Canvas Generation\nTarget ${context.nodeId}. Add requested content as editable layers. For images use generate_image with mountInOpenEditor=false, run_workflow and mount_image_in_design. For video or generated models use generate_video or generate_3d_model, run_workflow and edit_design_scene insert_media. For editable geometry use insert_mesh3d. Embed an existing Motion or 3D canvas with insert_canvas_instance, sourceCanvasId and instance layoutMode/playbackMode. To build a new nested master, create_node imageAsset, edit_design_scene set_canvas_type on that new node, populate it, then insert_canvas_instance into this captured target. A Design canvas can contain all these media types; do not substitute a flattened picture. Use generate_layout with this nodeId only for an explicit whole-page regeneration.`;
}
