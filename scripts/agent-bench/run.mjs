#!/usr/bin/env node
// A dry run validates task shapes and tool availability. It does not claim to generate designs.
import { AGENT_BENCH_TASKS } from './tasks/index.mjs';
import { canvasToolNames, validateTasks } from './validate.mjs';
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
console.log(JSON.stringify({ dryRun: true, ...validateTasks(AGENT_BENCH_TASKS, await canvasToolNames()) }));
