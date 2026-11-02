/**
 * Brainstorm session state: the canvas-level list of decisions the user has
 * accepted or rejected during a brainstorm. In-memory only for phase 1 — it
 * guides the model's next directions within a session; persisting across
 * reloads is a follow-up (design-p2-agent.md §2).
 */

export function createAgentBrainstormActions(set, get) {
  return {
    brainstorm: { decisions: [], updatedAt: null },

    /** Records one brainstorm decision (deduped by text). */
    recordBrainstormDecision(text, { accepted = true } = {}) {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) return false;
      const current = get().brainstorm?.decisions ?? [];
      const withoutDuplicate = current.filter(
        (decision) => decision.text !== trimmed,
      );
      set({
        brainstorm: {
          decisions: [...withoutDuplicate, { text: trimmed, accepted }],
          updatedAt: Date.now(),
        },
      });
      return true;
    },

    /** Clears all recorded decisions (new brainstorm session). */
    clearBrainstormDecisions() {
      set({ brainstorm: { decisions: [], updatedAt: null } });
    },
  };
}
