import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../../src/canvas/agent/canvas_tools.js";
import { CANVAS_TOOL_PLAN_SCHEMAS, PLAN_TOOL_EXECUTORS, getAgentPlan, resetAgentPlan } from "../../src/canvas/agent/canvas_tools_plan.js";

describe("Canvas Agent Plan Tools", () => {
  describe("schema registration", () => {
    it("exports CANVAS_TOOL_PLAN_SCHEMAS with update_plan and get_plan", () => {
      const names = CANVAS_TOOL_PLAN_SCHEMAS.map((s) => s.function.name);
      expect(names).toEqual(["update_plan", "get_plan"]);
      expect(new Set(names).size).toBe(names.length);
    });

    it("update_plan requires steps array with id, title, status", () => {
      const schema = CANVAS_TOOL_PLAN_SCHEMAS.find((s) => s.function.name === "update_plan").function.parameters;
      expect(schema.required).toEqual(["steps"]);
      expect(schema.properties.steps.items.required).toEqual(["id", "title", "status"]);
      expect(schema.properties.steps.items.properties.status.enum).toEqual(["pending", "in_progress", "done", "skipped"]);
    });

    it("get_plan has no required parameters", () => {
      const schema = CANVAS_TOOL_PLAN_SCHEMAS.find((s) => s.function.name === "get_plan").function.parameters;
      expect(schema.required).toBeUndefined();
    });
  });

  describe("update_plan executor", () => {
    beforeEach(() => {
      resetAgentPlan();
    });

    it("creates a new plan with steps and returns counts", async () => {
      const result = await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [
          { id: "1", title: "First step", status: "pending" },
          { id: "2", title: "Second step", status: "in_progress" },
          { id: "3", title: "Third step", status: "done" },
        ],
        note: "Initial plan",
      });

      expect(result.ok).toBe(true);
      expect(result.plan.steps).toHaveLength(3);
      expect(result.plan.note).toBe("Initial plan");
      expect(result.counts).toEqual({ pending: 1, in_progress: 1, done: 1, skipped: 0 });
      expect(getAgentPlan()).toEqual(result.plan);
    });

    it("accepts all valid statuses", async () => {
      const result = await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [
          { id: "a", title: "Pending", status: "pending" },
          { id: "b", title: "In progress", status: "in_progress" },
          { id: "c", title: "Done", status: "done" },
          { id: "d", title: "Skipped", status: "skipped" },
        ],
      });
      expect(result.counts).toEqual({ pending: 1, in_progress: 1, done: 1, skipped: 1 });
    });

    it("rejects more than one in_progress step", async () => {
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({
          steps: [
            { id: "1", title: "First", status: "in_progress" },
            { id: "2", title: "Second", status: "in_progress" },
          ],
        }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });

    it("rejects invalid status values", async () => {
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({
          steps: [{ id: "1", title: "Test", status: "invalid" }],
        }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });

    it("rejects missing or empty id", async () => {
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ id: "", title: "Test", status: "pending" }] }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ title: "Test", status: "pending" }] }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });

    it("rejects missing or empty title", async () => {
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ id: "1", title: "", status: "pending" }] }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ id: "1", status: "pending" }] }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });

    it("rejects non-array steps", async () => {
      await expect(PLAN_TOOL_EXECUTORS.update_plan({ steps: "not an array" })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
      await expect(PLAN_TOOL_EXECUTORS.update_plan({ steps: null })).rejects.toMatchObject({
        code: "agentInvalidArgs",
      });
    });

    it("rejects non-object step entries", async () => {
      await expect(
        PLAN_TOOL_EXECUTORS.update_plan({ steps: ["not an object"] }),
      ).rejects.toMatchObject({ code: "agentInvalidArgs" });
    });

    it("allows optional note", async () => {
      const result = await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [{ id: "1", title: "Test", status: "pending" }],
        note: "Some context",
      });
      expect(result.plan.note).toBe("Some context");
    });

    it("omits note when not provided", async () => {
      const result = await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [{ id: "1", title: "Test", status: "pending" }],
      });
      expect(result.plan.note).toBeUndefined();
    });

    it("replaces existing plan", async () => {
      await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [{ id: "old", title: "Old", status: "done" }],
      });
      const result = await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [{ id: "new", title: "New", status: "pending" }],
      });
      expect(result.plan.steps).toHaveLength(1);
      expect(result.plan.steps[0].id).toBe("new");
    });
  });

  describe("get_plan executor", () => {
    beforeEach(() => {
      resetAgentPlan();
    });

    it("returns null plan and zero counts when no plan exists", async () => {
      const result = await PLAN_TOOL_EXECUTORS.get_plan({});
      expect(result.ok).toBe(true);
      expect(result.plan).toBeNull();
      expect(result.counts).toEqual({ pending: 0, in_progress: 0, done: 0, skipped: 0 });
    });

    it("returns current plan with counts", async () => {
      await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [
          { id: "1", title: "Step 1", status: "done" },
          { id: "2", title: "Step 2", status: "in_progress" },
          { id: "3", title: "Step 3", status: "pending" },
          { id: "4", title: "Step 4", status: "skipped" },
        ],
      });
      const result = await PLAN_TOOL_EXECUTORS.get_plan({});
      expect(result.ok).toBe(true);
      expect(result.plan).not.toBeNull();
      expect(result.plan.steps).toHaveLength(4);
      expect(result.counts).toEqual({ pending: 1, in_progress: 1, done: 1, skipped: 1 });
    });

    it("does not modify the stored plan", async () => {
      await PLAN_TOOL_EXECUTORS.update_plan({
        steps: [{ id: "1", title: "Test", status: "pending" }],
      });
      const before = getAgentPlan();
      await PLAN_TOOL_EXECUTORS.get_plan({});
      const after = getAgentPlan();
      expect(after).toBe(before);
    });
  });

  describe("module-level helpers", () => {
    beforeEach(() => {
      resetAgentPlan();
    });
    afterEach(() => {
      resetAgentPlan();
    });

    it("getAgentPlan returns the stored plan", async () => {
      expect(getAgentPlan()).toBeNull();
      await PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ id: "1", title: "Test", status: "pending" }] });
      expect(getAgentPlan()).not.toBeNull();
    });

    it("resetAgentPlan clears the stored plan", async () => {
      await PLAN_TOOL_EXECUTORS.update_plan({ steps: [{ id: "1", title: "Test", status: "pending" }] });
      expect(getAgentPlan()).not.toBeNull();
      resetAgentPlan();
      expect(getAgentPlan()).toBeNull();
    });
  });
});