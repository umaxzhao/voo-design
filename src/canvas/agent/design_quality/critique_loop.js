/** Feedback includes actionable fixes and stable node ids for the next turn. */
export function formatIssuesForModel(result) {
  return (result?.issues ?? []).map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.rule}: ${issue.message}${issue.nodeIds?.length ? ` (nodes: ${issue.nodeIds.join(', ')})` : ''}\n   Fix: ${issue.fix}`).join('\n');
}

/** maxRounds counts lint evaluations, including the initial and final checks. */
export async function runCritiqueLoop({ lint, fix, maxRounds = 3, threshold = 85 }) {
  if (typeof lint !== 'function') throw new TypeError('lint must be a function');
  if (!Number.isFinite(maxRounds) || maxRounds < 1) throw new RangeError('maxRounds must be at least 1');
  const rounds = [];
  let final;
  for (let round = 1; round <= Math.floor(maxRounds); round++) {
    final = await lint();
    rounds.push({ score: final.score, issues: structuredClone(final.issues ?? []) });
    if (final.score >= threshold || round === Math.floor(maxRounds) || typeof fix !== 'function') break;
    await fix(formatIssuesForModel(final), round);
  }
  return { rounds, final };
}
