/**
 * Workflow store action slice: project memory operations.
 *
 * @module store/workflow_memory_actions
 */

import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { scheduleSave } from "./persistence.js";
import {
  createEmptyProjectMemory,
  addMemoryItem,
  removeMemoryItem,
  clearProjectMemory,
  touchMemories,
} from "../agent-runtime/project-memory.js";

export function createWorkflowMemoryActions(set, get) {
  return {
    getProjectMemory() {
      return get().projectMemory || createEmptyProjectMemory();
    },

    addProjectMemoryItem(item) {
      if (isWorkflowReadOnly(get())) {
        return get().projectMemory || createEmptyProjectMemory();
      }
      const current = get().projectMemory || createEmptyProjectMemory();
      const updated = addMemoryItem(current, item);
      set({ projectMemory: updated });
      scheduleSave(get);
      return updated;
    },

    removeProjectMemoryItem(id) {
      if (isWorkflowReadOnly(get())) {
        return get().projectMemory || createEmptyProjectMemory();
      }
      const current = get().projectMemory || createEmptyProjectMemory();
      const updated = removeMemoryItem(current, id);
      set({ projectMemory: updated });
      scheduleSave(get);
      return updated;
    },

    clearProjectMemory() {
      if (isWorkflowReadOnly(get())) {
        return get().projectMemory || createEmptyProjectMemory();
      }
      const current = get().projectMemory || createEmptyProjectMemory();
      const updated = clearProjectMemory(current);
      set({ projectMemory: updated });
      scheduleSave(get);
      return updated;
    },

    touchProjectMemories(usedIds) {
      if (isWorkflowReadOnly(get())) {
        return get().projectMemory || createEmptyProjectMemory();
      }
      const current = get().projectMemory || createEmptyProjectMemory();
      const updated = touchMemories(current, usedIds);
      set({ projectMemory: updated });
      scheduleSave(get);
      return updated;
    },
  };
}
