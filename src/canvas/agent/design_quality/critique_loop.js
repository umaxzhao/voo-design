/**
 * STUB — placeholder so the module contract and index.js re-exports resolve
 * before the full critique loop lands. The critique owner will replace this
 * file verbatim. Contract:
 *   formatIssuesForModel(lintResult) -> string
 *   runCritiqueLoop({lint, fix, maxRounds, threshold}) -> {rounds, final}
 */
export function formatIssuesForModel(lintResult) {
  const issues = Array.isArray(lintResult?.issues) ? lintResult.issues : [];
  if (issues.length === 0) return "";
  return issues
    .map(
      (issue, i) =>
        `${i + 1}. [${issue.severity ?? "warn"}] ${issue.rule ?? "issue"}: ${issue.message ?? ""}` +
        (Array.isArray(issue.nodeIds) && issue.nodeIds.length ? ` (nodes: ${issue.nodeIds.join(", ")})` : "") +
        (issue.fix ? `\n   fix: ${issue.fix}` : ""),
    )
    .join("\n");
}

export async function runCritiqueLoop({
  lint,
  fix,
  maxRounds = 3,
  threshold = 85,
} = {}) {
  if (typeof lint !== "function") return { rounds: [], final: null };
  const rounds = [];
  let current = await lint();
  for (let round = 1; round <= Math.max(0, Math.floor(maxRounds)); round += 1) {
    rounds.push({ round, score: current?.score ?? 0, issues: current?.issues ?? [] });
    if (current?.score >= threshold && (current?.issues ?? []).length === 0) break;
    if (typeof fix !== "function") break;
    current = (await fix(round)) ?? (await lint());
  }
  return { rounds, final: current };
}
