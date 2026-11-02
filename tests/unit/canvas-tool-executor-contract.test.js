import { expect, it } from "vitest";
import { CANVAS_TOOL_SCHEMAS, EXECUTORS } from "../../src/canvas/agent/canvas_tools.js";

it("routes every advertised canvas tool to a real executor", () => {
  const missing = CANVAS_TOOL_SCHEMAS.map(({ function: tool }) => tool.name)
    .filter(name => typeof EXECUTORS[name] !== "function");
  expect(missing).toEqual([]);
});
