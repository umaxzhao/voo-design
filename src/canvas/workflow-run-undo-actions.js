function runAction(
  actionId,
  userAction,
  boundary,
  source,
  indirectHistoryCallCount,
) {
  return Object.freeze({
    actionId,
    domain: "workflow",
    userAction,
    boundary,
    expectedEntries: 1,
    noOpEntries: 0,
    pendingEntries: 0,
    progressEntries: 0,
    failureEntries: 0,
    requiresHistoryWriter: false,
    indirectHistoryCall: "startRun",
    indirectHistoryCallCount,
    delegatesTo: "workflow.async.run",
    source,
  });
}

/** Declares every UI or agent entry point that delegates to workflow history. */
export function createWorkflowRunUndoActionContracts(boundary) {
  return Object.freeze({
    "workflow.run.nodeEditor": runAction(
      "workflow.run.nodeEditor",
      "Run one workflow node from its editor",
      boundary.ASYNC_FINAL,
      "src/canvas/components/node_editor.jsx",
      1,
    ),
    "workflow.run.storyboardEditor": runAction(
      "workflow.run.storyboardEditor",
      "Render a storyboard's keyframes from its editor",
      boundary.ASYNC_FINAL,
      "src/canvas/components/storyboard_editor.jsx",
      1,
    ),
    "workflow.run.apiMediaNode": runAction(
      "workflow.run.apiMediaNode",
      "Run one API media node",
      boundary.ASYNC_FINAL,
      "src/canvas/nodes/api_media_node.jsx",
      1,
    ),
    "workflow.run.apiModel3dNode": runAction(
      "workflow.run.apiModel3dNode",
      "Run one API 3D node",
      boundary.ASYNC_FINAL,
      "src/canvas/nodes/api_model_3d_node.jsx",
      1,
    ),
    "workflow.run.topBar": runAction(
      "workflow.run.topBar",
      "Run the workflow from the top bar",
      boundary.ASYNC_FINAL,
      "src/canvas/components/top_bar.jsx",
      1,
    ),
    "workflow.run.topBarUpdates": runAction(
      "workflow.run.topBarUpdates",
      "Run changed workflow nodes from the top bar menu",
      boundary.ASYNC_FINAL,
      "src/canvas/components/top_bar_workflow_menu.jsx",
      1,
    ),
    "workflow.run.bannerResume": runAction(
      "workflow.run.bannerResume",
      "Resume a workflow from the run banner",
      boundary.ASYNC_FINAL,
      "src/canvas/components/run_banner.jsx",
      2,
    ),
    "workflow.agent.runWorkflow": runAction(
      "workflow.agent.runWorkflow",
      "Run one workflow request through the agent",
      boundary.ASYNC_FINAL,
      "src/canvas/components/agent-panel/tools/runWorkflow.js",
      // Explicit batches have one entry; full and selected share the other.
      2,
    ),
  });
}
