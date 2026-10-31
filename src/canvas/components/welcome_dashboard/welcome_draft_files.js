/** Root-level or otherwise unfiled documents appear in Drafts by default. */
export function collectDraftFiles(workspaceFiles, recentDrafts) {
  const workspacePaths = new Set();
  const workspaceIds = new Set();
  const workspaceNames = new Set();

  for (const file of workspaceFiles) {
    if (file.path) workspacePaths.add(file.path);
    if (file.id) workspaceIds.add(file.id);
    if (file.name) workspaceNames.add(file.name);
  }

  const drafts = workspaceFiles
    .filter((file) => !file.folder)
    .map((file) => ({ ...file, folder: null, isDraft: true }));

  for (const recent of recentDrafts) {
    if (recent.folder) continue;
    if (recent.path && (workspacePaths.has(recent.path) || workspaceIds.has(recent.path))) continue;
    if (recent.id && workspaceIds.has(recent.id)) continue;
    if (!recent.path && recent.name && workspaceNames.has(recent.name)) continue;
    if (drafts.some((file) => sameFile(file, recent))) continue;
    drafts.push({ ...recent, folder: null, isDraft: true });
  }

  return drafts;
}

function sameFile(left, right) {
  if (left.path && right.path) return left.path === right.path;
  if (left.id && right.id) return left.id === right.id;
  return Boolean(left.name && left.name === right.name);
}
