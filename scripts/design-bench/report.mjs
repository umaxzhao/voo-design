#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JUDGE_DIMENSIONS } from './score.mjs';

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const judgeMean = task => task?.judge && JUDGE_DIMENSIONS.every(key => Number.isFinite(task.judge[key]))
  ? mean(JUDGE_DIMENSIONS.map(key => task.judge[key])) : null;
const show = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const delta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
const signed = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${show(value)}` : '—';

export function formatReport(before, after, labelA = before?.label || 'before', labelB = after?.label || 'after') {
  const a = new Map((before?.tasks || []).map(task => [task.id, task]));
  const b = new Map((after?.tasks || []).map(task => [task.id, task]));
  const lines = [`| Task | ${labelA} lint | ${labelB} lint | Δ lint | ${labelA} judge /5 | ${labelB} judge /5 | Δ judge | Status |`, '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
  const changes = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(id), right = b.get(id);
    const gain = delta(judgeMean(left), judgeMean(right));
    if (gain !== null) changes.push({ id, gain });
    const status = [left?.antiAi?.hardFail && `${labelA} anti-AI failed`, right?.antiAi?.hardFail && `${labelB} anti-AI failed`,left?.error && `${labelA} failed`, right?.error && `${labelB} failed`, left?.judgeError && `${labelA} judge failed`, right?.judgeError && `${labelB} judge failed`].filter(Boolean).join('; ') || (!left || !right ? 'missing run' : 'ok');
    lines.push(`| ${id.replace(/\|/g, '\\|')} | ${show(left?.lint?.score)} | ${show(right?.lint?.score)} | ${signed(delta(left?.lint?.score, right?.lint?.score))} | ${show(judgeMean(left))} | ${show(judgeMean(right))} | ${signed(gain)} | ${status} |`);
  }
  const average = (map, get) => mean([...map.values()].map(get).filter(Number.isFinite));
  const lintA = average(a, task => task.lint?.score), lintB = average(b, task => task.lint?.score);
  const judgeA = average(a, judgeMean), judgeB = average(b, judgeMean);
  lines.push(`| Mean | ${show(lintA)} | ${show(lintB)} | ${signed(delta(lintA, lintB))} | ${show(judgeA)} | ${show(judgeB)} | ${signed(delta(judgeA, judgeB))} | available scores |`);
  for (const [name, entries] of [
    ['Biggest judge gains', changes.filter(item => item.gain > 0).sort((a, b) => b.gain - a.gain)],
    ['Biggest judge losses', changes.filter(item => item.gain < 0).sort((a, b) => a.gain - b.gain)],
  ]) lines.push(`\n${name}: ${entries.slice(0, 3).map(item => `${item.id} (${signed(item.gain)})`).join(', ') || 'none'}.`);
  return lines.join('\n');
}
async function main() {
  const labels = { a: 'before', b: 'after' };
  for (const arg of process.argv.slice(2)) {
    const match = /^--([ab])=([a-z0-9-]+)$/.exec(arg);
    if (!match) throw new Error('Expected --a=<label> or --b=<label>, matching [a-z0-9-]+');
    labels[match[1]] = match[2];
  }
  const runs = await Promise.all([labels.a, labels.b].map(async label => {
    try { return JSON.parse(await readFile(`/workspace/tmp/design-bench/${label}/scores.json`, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; console.warn(`Warning: ${label} run missing`); return null; }
  }));
  console.log(formatReport(...runs, labels.a, labels.b));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
