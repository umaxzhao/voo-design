/**
 * scripts/agent-bench/validate.mjs
 *
 * Task schema validation + machine-checkable predicate evaluation for the
 * Phase 0 agent benchmark set (design-generation tasks).
 *
 * State object:
 *   {
 *     editor: {
 *       artboard: { width, height } | null,
 *       layers: [{ id, kind, text? }],
 *     },
 *   }
 *
 * Layer kinds are editor layer kinds ("text", "image", "shape", "video",
 * "group").
 */

import { TASK_CATEGORIES } from "./tasks/index.mjs";

export const PREDICATE_TYPES = Object.freeze([
  "layerCount",
  "layerTextIncludes",
  "artboardSize",
]);

const LAYER_KINDS = new Set(["text", "image", "shape", "video", "audio", "group"]);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function validatePredicate(pred, index, errors) {
  const label = `expect[${index}]`;
  if (!isPlainObject(pred)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!PREDICATE_TYPES.includes(pred.type)) {
    errors.push(`${label}.type must be one of ${PREDICATE_TYPES.join("|")}, got ${JSON.stringify(pred.type)}`);
    return;
  }

  const needRange = () => {
    if (!isPositiveInt(pred.min) || pred.min < 1) {
      errors.push(`${label}.min must be an integer >= 1`);
    }
    if (pred.max !== undefined && (!isPositiveInt(pred.max) || pred.max < pred.min)) {
      errors.push(`${label}.max must be an integer >= min`);
    }
  };

  switch (pred.type) {
    case "layerCount":
      if (pred.layerKind !== undefined && (typeof pred.layerKind !== "string" || !LAYER_KINDS.has(pred.layerKind))) {
        errors.push(`${label}.layerKind must be a known layer kind, got ${JSON.stringify(pred.layerKind)}`);
      }
      needRange();
      break;
    case "layerTextIncludes":
      if (typeof pred.text !== "string" || pred.text.length === 0) {
        errors.push(`${label}.text must be a non-empty string`);
      }
      break;
    case "artboardSize":
      if (!isPositiveInt(pred.width) || !isPositiveInt(pred.height) || pred.width === 0 || pred.height === 0) {
        errors.push(`${label} requires positive integer width and height`);
      }
      break;
    default:
      break;
  }
}

/**
 * Schema-checks a single benchmark task. Returns { ok, errors }.
 */
export function validateTask(task) {
  const errors = [];
  if (!isPlainObject(task)) {
    return { ok: false, errors: ["task must be an object"] };
  }
  if (typeof task.id !== "string" || !ID_PATTERN.test(task.id)) {
    errors.push(`id must be kebab-case, got ${JSON.stringify(task.id)}`);
  }
  if (!TASK_CATEGORIES.includes(task.category)) {
    errors.push(`category must be one of ${TASK_CATEGORIES.join("|")}, got ${JSON.stringify(task.category)}`);
  }
  if (typeof task.prompt !== "string" || task.prompt.length < 20) {
    errors.push("prompt must be a string of at least 20 characters");
  }
  if (!Array.isArray(task.expect) || task.expect.length === 0) {
    errors.push("expect must be a non-empty array of predicates");
  } else {
    task.expect.forEach((pred, i) => validatePredicate(pred, i, errors));
  }
  if (!Array.isArray(task.visualCriteria) || task.visualCriteria.length === 0 || task.visualCriteria.some((c) => typeof c !== "string" || c.length === 0)) {
    errors.push("visualCriteria must be a non-empty array of strings");
  }
  if (typeof task.costCeilingUsd !== "number" || !(task.costCeilingUsd > 0)) {
    errors.push("costCeilingUsd must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Schema-checks a whole task set, including id uniqueness.
 */
export function validateTaskSet(tasks) {
  const errors = [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { ok: false, errors: ["task set must be a non-empty array"] };
  }
  const seen = new Set();
  tasks.forEach((task, i) => {
    const result = validateTask(task);
    for (const err of result.errors) errors.push(`tasks[${i}] (${task && task.id}): ${err}`);
    if (task && typeof task.id === "string") {
      if (seen.has(task.id)) errors.push(`duplicate task id ${task.id}`);
      seen.add(task.id);
    }
  });
  return { ok: errors.length === 0, errors };
}

function editorOf(state) {
  if (!isPlainObject(state) || !isPlainObject(state.editor)) {
    throw new Error("state.editor must be an object with artboard and layers");
  }
  if (!Array.isArray(state.editor.layers)) {
    throw new Error("state.editor.layers must be an array");
  }
  return state.editor;
}

/**
 * Evaluates a single predicate against the editor state.
 * Returns { pass, detail }.
 */
export function evaluatePredicate(pred, state) {
  const { editor } = state;
  const label = JSON.stringify(pred);

  if (pred.type === "artboardSize") {
    const { artboard } = editor;
    const pass = artboard && artboard.width === pred.width && artboard.height === pred.height;
    return {
      pass,
      detail: pass ? "artboard size matches" : `expected ${pred.width}×${pred.height}, got ${artboard ? `${artboard.width}×${artboard.height}` : "no artboard"}`,
      predicate: pred,
    };
  }

  if (pred.type === "layerCount") {
    const layers = editor.layers || [];
    const filtered = pred.layerKind ? layers.filter((l) => l.kind === pred.layerKind) : layers;
    const count = filtered.length;
    const min = pred.min ?? 1;
    const max = pred.max ?? Infinity;
    const pass = count >= min && count <= max;
    const range = max === Infinity ? `>= ${min}` : min === max ? `exactly ${min}` : `${min}-${max}`;
    return {
      pass,
      detail: pass ? `${count} layer(s) found` : `expected ${range} layer(s), got ${count}`,
      predicate: pred,
    };
  }

  if (pred.type === "layerTextIncludes") {
    const layers = editor.layers || [];
    const found = layers.some((l) => l.text && l.text.includes(pred.text));
    return {
      pass: found,
      detail: found ? `"${pred.text}" found in layers` : `"${pred.text}" not found in any layer`,
      predicate: pred,
    };
  }

  return { pass: false, detail: `unknown predicate type: ${pred.type}`, predicate: pred };
}

/**
 * Evaluates all predicates for a task against the provided state.
 * Returns { pass, results }.
 */
export function evaluateTask(task, state) {
  const results = task.expect.map((pred) => evaluatePredicate(pred, state));
  const pass = results.every((r) => r.pass);
  return {
    pass,
    results,
  };
}

/** Read schema names without importing the browser-only editor runtime. */
export async function canvasToolNames() {
  const { readdir, readFile } = await import('node:fs/promises');
  const directory = new URL('../../src/canvas/agent/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^canvas_tools.*\.js$/.test(file));
  const sources = await Promise.all(files.map(file => readFile(new URL(file, directory), 'utf8')));
  return new Set(sources.flatMap(source => [...source.matchAll(/name:\s*["']([a-z_]+)["']/g)].map(match => match[1])));
}

export function validateTasks(tasks, names) {
  const schema = validateTaskSet(tasks);
  if (!schema.ok) throw new Error(schema.errors.join('\n'));
  for (const task of tasks) {
    if (!task.requiredTools?.length) throw new Error(`${task.id}: missing requiredTools`);
    for (const name of task.requiredTools) if (!names.has(name)) throw new Error(`${task.id}: unknown canvas tool ${name}`);
  }
  return { tasks: tasks.length, requiredTools: [...new Set(tasks.flatMap(task => task.requiredTools))] };
}
