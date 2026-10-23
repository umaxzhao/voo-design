#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JUDGE_DIMENSIONS } from './score.mjs';

function judgeMean(task) {
  return task?.judge ? (JUDGE_DIMENSIONS.reduce((sum, key) => sum + task.judge[key], 0) / JUDGE_DIMENSIONS.length).toFixed(2) : '—';
}
export function formatReport(before, after) {
  const a = new Map((before?.tasks || []).map(task => [task.id, task]));
  const b = new Map((after?.tasks || []).map(task => [task.id, task]));
  const lines = ['| Task | Before lint | After lint | Δ lint | Before judge /5 | After judge /5 | Status |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(id), right = b.get(id);
    const delta = Number.isFinite(left?.lint?.score) && Number.isFinite(right?.lint?.score) ? right.lint.score - left.lint.score : null;
    const status = [left?.error && 'before failed', right?.error && 'after failed', left?.judgeError && 'before judge failed', right?.judgeError && 'after judge failed'].filter(Boolean).join('; ') || (!left || !right ? 'missing run' : 'ok');
    lines.push(`| ${id.replace(/\|/g, '\\|')} | ${left?.lint?.score ?? '—'} | ${right?.lint?.score ?? '—'} | ${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`} | ${judgeMean(left)} | ${judgeMean(right)} | ${status} |`);
  }
  return lines.join('\n');
}
async function main() {
  const runs = await Promise.all(['before', 'after'].map(async label => {
    try { return JSON.parse(await readFile(`/workspace/tmp/design-bench/${label}/scores.json`, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; console.warn(`Warning: ${label} run missing`); return null; }
  }));
  console.log(formatReport(...runs));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
