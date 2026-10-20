// Registry builtins: verifier wiring and construction of the default tool set.

import { createToolsFromCommandTable } from "./tools/editor_command.js";
import {
  verifyGenerateLayout,
  verifyCreateNode,
  verifyRegionalPixels,
} from "./verifier.js";
import { ToolRegistry } from "./tool-registry-dispatch.js";
import createNodeTool from "./tools/createNode.js";
import buildWorkflowTool from "./tools/buildWorkflow.js";
import buildGameAssetWorkflowTool from "./tools/buildGameAssetWorkflow.js";
import mountImageInDesignTool from "./tools/mountImageInDesign.js";
import {
  getDesignSceneTool,
  editDesignSceneTool,
} from "./tools/design_scene.js";
import buildVideoStoryboardTool from "./tools/buildVideoStoryboard.js";
import connectNodesTool from "./tools/connectNodes.js";
import bindAgentGroupTool from "./tools/bindAgentGroup.js";
import editNodeTool from "./tools/editNode.js";
import deleteNodeTool from "./tools/deleteNode.js";
import listNodesTool from "./tools/listNodes.js";
import runWorkflowTool from "./tools/runWorkflow.js";
import generateImageTool from "./tools/generateImage.js";
import generateVideoTool from "./tools/generateVideo.js";
import generate3dModelTool from "./tools/generate3dModel.js";
import updatePlanTool from "./tools/updatePlan.js";
import requestUserInputTool from "./tools/requestUserInput.js";
import editGeneratedImageTool from "./tools/editGeneratedImage.js";
import inspectSelectionTool from "./tools/inspectSelection.js";
import selectRegionTool from "./tools/selectRegion.js";
import selectObjectTool from "./tools/selectObject.js";
import locateObjectTool from "./tools/locateObject.js";
import lookAtCanvasTool from "./tools/lookAtCanvas.js";
import layerViaCopyTool from "./tools/layerViaCopy.js";
import refineSelectionTool from "./tools/refineSelection.js";
import fillSelectionTool from "./tools/fillSelection.js";
import repaintSelectionTool from "./tools/repaintSelection.js";
import saveAsSubgraphTool from "./tools/saveAsSubgraph.js";
import instantiateSubgraphTool from "./tools/instantiateSubgraph.js";
import toolSearchTool from "./tools/toolSearch.js";
import listSkillsTool from "./tools/listSkills.js";
import useSkillTool from "./tools/useSkill.js";
import readSkillResourceTool from "./tools/readSkillResource.js";
import listRecipesTool from "./tools/listRecipes.js";
import useRecipeTool from "./tools/useRecipe.js";
import createMultiCanvasTool from "./tools/createMultiCanvas.js";
import {
  getPresentationTool,
  editPresentationTool,
} from "./tools/presentation.js";
import analyzeCanvasTool from "./tools/analyzeCanvas.js";
import alignLayoutTool from "./tools/alignLayout.js";
import searchTemplatesTool from "./tools/searchTemplates.js";
import critiqueDesignTool from "./tools/critiqueDesign.js";
import autoFixDesignTool from "./tools/autoFixDesign.js";
import iterateDesignTool from "./tools/iterateDesign.js";
import generateLayoutTool from "./tools/generateLayout.js";
import pickVersionTool from "./tools/pickVersion.js";
import brainstormTool from "./tools/brainstorm.js";
import webSearchTool from "./tools/web_search.js";
import getEditorContextTool from "./tools/getEditorContext.js";
import drawVectorTool from "./tools/drawVector.js";
import applyCopyStructureTool from "./tools/applyCopyStructure.js";
import observeCanvasTool from "./tools/observeCanvas.js";
import updateProjectBriefTool from "./tools/updateProjectBrief.js";
import rememberProjectDecisionTool from "./tools/rememberProjectDecision.js";
import promoteToGlobalMemoryTool from "./tools/promoteToGlobalMemory.js";
import { computerObserveTool, computerActTool } from "./tools/computerUse.js";
import showWorkspaceTool from "./tools/showWorkspace.js";
import editImageLayerTool from "./tools/edit_image_layer.js";

const BUILTIN_TOOLS = [
  editImageLayerTool,
  showWorkspaceTool,
  createNodeTool,
  buildWorkflowTool,
  buildGameAssetWorkflowTool,
  mountImageInDesignTool,
  getDesignSceneTool,
  editDesignSceneTool,
  buildVideoStoryboardTool,
  connectNodesTool,
  bindAgentGroupTool,
  editNodeTool,
  deleteNodeTool,
  listNodesTool,
  runWorkflowTool,
  generateImageTool,
  generateVideoTool,
  generate3dModelTool,
  updatePlanTool,
  requestUserInputTool,
  editGeneratedImageTool,
  inspectSelectionTool,
  createMultiCanvasTool,
  getPresentationTool,
  editPresentationTool,
  selectRegionTool,
  lookAtCanvasTool,
  observeCanvasTool,
  locateObjectTool,
  selectObjectTool,
  layerViaCopyTool,
  refineSelectionTool,
  fillSelectionTool,
  repaintSelectionTool,
  saveAsSubgraphTool,
  instantiateSubgraphTool,
  toolSearchTool,
  listSkillsTool,
  useSkillTool,
  readSkillResourceTool,
  listRecipesTool,
  useRecipeTool,
  analyzeCanvasTool,
  alignLayoutTool,
  searchTemplatesTool,
  critiqueDesignTool,
  autoFixDesignTool,
  iterateDesignTool,
  generateLayoutTool,
  pickVersionTool,
  brainstormTool,
  webSearchTool,
  getEditorContextTool,
  drawVectorTool,
  applyCopyStructureTool,
  updateProjectBriefTool,
  rememberProjectDecisionTool,
  promoteToGlobalMemoryTool,
  computerObserveTool,
  computerActTool,
];

const byName = new Map(
  BUILTIN_TOOLS.filter(Boolean).map((tool) => [tool.spec?.name, tool]),
);
byName.get("create_node").capabilities = {
  ...byName.get("create_node").capabilities,
  verify: verifyCreateNode,
};
byName.get("generate_layout").capabilities = {
  ...byName.get("generate_layout").capabilities,
  verify: verifyGenerateLayout,
};
byName.get("repaint_selection").capabilities = {
  ...byName.get("repaint_selection").capabilities,
  verify: verifyRegionalPixels,
};
byName.get("fill_selection").capabilities = {
  ...byName.get("fill_selection").capabilities,
  verify: verifyRegionalPixels,
};

export async function createDefaultRegistry() {
  const registry = new ToolRegistry();
  for (const tool of createToolsFromCommandTable()) {
    const handler = tool?.default ?? tool;
    if (handler?.spec?.name) registry.register(handler);
  }
  for (const tool of BUILTIN_TOOLS) {
    const handler = tool?.default ?? tool;
    if (!handler?.spec?.name) continue;
    if (
      [
        "analyze_canvas",
        "align_layout",
        "search_templates",
        "critique_design",
        "generate_layout",
        "inspect_selection",
        "pick_version",
        "brainstorm",
        "web_search",
        "computer_observe",
        "computer_act",
      ].includes(handler.spec.name)
    ) {
      handler.exposure = "deferred";
    }
    registry.register(handler);
  }
  return registry;
}
