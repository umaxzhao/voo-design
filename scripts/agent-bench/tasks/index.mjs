/**
 * scripts/agent-bench/tasks/index.mjs
 *
 * Design-generation agent benchmark tasks (Phase 0 subset).
 */

import { DESIGN_GENERATION_TASKS } from "./design-generation.mjs";

export const TASK_CATEGORIES = Object.freeze([
  "design-generation",
]);

export const AGENT_BENCH_TASKS = Object.freeze([
  ...DESIGN_GENERATION_TASKS,
]);
