/**
 * tests/unit/agent_bench_tasks.test.js
 *
 * Vitest suite: validates agent benchmark task schema and dry-run evaluation.
 */

import { describe, it, expect } from "vitest";
import { AGENT_BENCH_TASKS } from "../../scripts/agent-bench/tasks/index.mjs";
import {
  validateTask,
  validateTaskSet,
  evaluateTask,
  evaluatePredicate,
} from "../../scripts/agent-bench/validate.mjs";

describe("agent-bench tasks", () => {
  it("should have at least one task", () => {
    expect(AGENT_BENCH_TASKS).toBeInstanceOf(Array);
    expect(AGENT_BENCH_TASKS.length).toBeGreaterThan(0);
  });

  it("should pass schema validation for the entire task set", () => {
    const schema = validateTaskSet(AGENT_BENCH_TASKS);
    if (!schema.ok) {
      console.error("Schema validation errors:", schema.errors);
    }
    expect(schema.ok).toBe(true);
    expect(schema.errors).toEqual([]);
  });

  it("should have valid schema for each task", () => {
    for (const task of AGENT_BENCH_TASKS) {
      const schema = validateTask(task);
      if (!schema.ok) {
        console.error(`Task ${task.id} schema errors:`, schema.errors);
      }
      expect(schema.ok).toBe(true);
      expect(schema.errors).toEqual([]);
    }
  });

  it("should have unique task ids", () => {
    const ids = AGENT_BENCH_TASKS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should have valid categories", () => {
    const validCategories = ["design-generation"];
    for (const task of AGENT_BENCH_TASKS) {
      expect(validCategories).toContain(task.category);
    }
  });

  it("should have valid prompt lengths", () => {
    for (const task of AGENT_BENCH_TASKS) {
      expect(task.prompt.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("should have expect predicates with valid types", () => {
    const validTypes = [
      "layerCount",
      "layerTextIncludes",
      "artboardSize",
    ];
    for (const task of AGENT_BENCH_TASKS) {
      expect(task.expect.length).toBeGreaterThan(0);
      for (const pred of task.expect) {
        expect(validTypes).toContain(pred.type);
      }
    }
  });

  it("should evaluate predicates against synthetic state", () => {
    const state = {
      editor: {
        artboard: { width: 1080, height: 1440 },
        layers: [
          { id: "text-1", kind: "text", text: "NEON PULSE" },
          { id: "text-2", kind: "text", text: "July 18" },
          { id: "image-1", kind: "image" },
        ],
      },
    };

    // Test artboardSize predicate
    const sizePred = { type: "artboardSize", width: 1080, height: 1440 };
    const sizeResult = evaluatePredicate(sizePred, state);
    expect(sizeResult.pass).toBe(true);

    // Test layerCount predicate
    const countPred = { type: "layerCount", layerKind: "text", min: 2, max: 5 };
    const countResult = evaluatePredicate(countPred, state);
    expect(countResult.pass).toBe(true);

    // Test layerTextIncludes predicate
    const textPred = { type: "layerTextIncludes", text: "NEON PULSE" };
    const textResult = evaluatePredicate(textPred, state);
    expect(textResult.pass).toBe(true);

    // Test failing predicate
    const failPred = { type: "layerTextIncludes", text: "NOT FOUND" };
    const failResult = evaluatePredicate(failPred, state);
    expect(failResult.pass).toBe(false);
  });

  it("should evaluate tasks against synthetic state", () => {
    const task = {
      id: "test-task",
      category: "design-generation",
      prompt: "Design something for testing",
      expect: [
        { type: "artboardSize", width: 1080, height: 1440 },
        { type: "layerCount", layerKind: "text", min: 1 },
        { type: "layerTextIncludes", text: "Test" },
      ],
      visualCriteria: ["looks good"],
      costCeilingUsd: 0.10,
    };

    const state = {
      editor: {
        artboard: { width: 1080, height: 1440 },
        layers: [{ id: "t1", kind: "text", text: "Test" }],
      },
    };

    const evaluation = evaluateTask(task, state);
    expect(evaluation.pass).toBe(true);
    expect(evaluation.results.every((r) => r.pass)).toBe(true);
  });

  it("should handle predicate failures correctly", () => {
    const task = {
      id: "test-fail-task",
      category: "design-generation",
      prompt: "Design something",
      expect: [
        { type: "artboardSize", width: 1920, height: 1080 },
        { type: "layerCount", layerKind: "image", min: 2 },
      ],
      visualCriteria: ["test"],
      costCeilingUsd: 0.10,
    };

    const state = {
      editor: {
        artboard: { width: 1080, height: 1440 },
        layers: [{ id: "i1", kind: "image" }],
      },
    };

    const evaluation = evaluateTask(task, state);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.results.some((r) => !r.pass)).toBe(true);
  });

  it("each task should have valid visual criteria", () => {
    for (const task of AGENT_BENCH_TASKS) {
      expect(Array.isArray(task.visualCriteria)).toBe(true);
      expect(task.visualCriteria.length).toBeGreaterThan(0);
      for (const criterion of task.visualCriteria) {
        expect(typeof criterion).toBe("string");
        expect(criterion.length).toBeGreaterThan(0);
      }
    }
  });

  it("each task should have valid cost ceiling", () => {
    for (const task of AGENT_BENCH_TASKS) {
      expect(typeof task.costCeilingUsd).toBe("number");
      expect(task.costCeilingUsd).toBeGreaterThan(0);
    }
  });
});
