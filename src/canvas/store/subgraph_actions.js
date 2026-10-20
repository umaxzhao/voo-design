/**
 * Subgraph template actions (plan P3-2): instantiate a saved subgraph
 * template onto the canvas from the template picker.
 *
 * Templates live in localStorage (see engine/subgraph_templates.js — the pure
 * extraction/instantiation module). This store action loads one by name,
 * instantiates it at a sensible position, and merges the new nodes/edges in a
 * single history step.
 */

import {
  instantiateSubgraph,
  listSubgraphTemplates,
  loadSubgraphTemplate,
  saveSubgraphTemplate,
} from "../engine/subgraph_templates.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/** Position for a freshly instantiated template, offset from the canvas view. */
function defaultPosition(get) {
  const nodes = get().nodes ?? [];
  const maxY = nodes.reduce(
    (max, node) => Math.max(max, node.position?.y ?? 0),
    0,
  );
  return { x: 60, y: maxY + 80 };
}

export function createSubgraphActions(set, get) {
  return {
    /**
     * Bumps the version counter the template picker subscribes to, so a
     * template shared by a collab peer (or saved locally) shows up live.
     */
    bumpSubgraphTemplates() {
      set({
        subgraphTemplatesVersion: (get().subgraphTemplatesVersion ?? 0) + 1,
      });
    },

    /** Receives a template shared by a collab peer: store it + refresh UI. */
    receiveSubgraphTemplate(template) {
      if (!template?.name || !Array.isArray(template?.nodes)) return false;
      const saved = saveSubgraphTemplate(template);
      if (saved) get().bumpSubgraphTemplates();
      return saved;
    },
    /** Lists saved subgraph templates ({name, nodeCount, edgeCount}). */
    listSubgraphTemplates() {
      const all = listSubgraphTemplates();
      return Object.values(all).map((template) => ({
        name: template.name,
        nodeCount: template.nodes?.length ?? 0,
        edgeCount: template.edges?.length ?? 0,
      }));
    },

    /**
     * Instantiates a saved template onto the canvas. Returns the new node ids,
     * or null when the template is missing.
     */
    instantiateSubgraphTemplate(name, position) {
      if (isWorkflowReadOnly(get())) return null;
      const template = loadSubgraphTemplate(name);
      if (!template) return null;
      const { nodes, edges } = instantiateSubgraph(
        template,
        position ?? defaultPosition(get),
      );
      if (nodes.length === 0) return null;
      commitWorkflowHistory(get, "workflow.subgraph.instantiate");
      set({
        nodes: [...(get().nodes ?? []), ...nodes],
        edges: [...(get().edges ?? []), ...edges],
      });
      return nodes.map((node) => node.id);
    },
  };
}
