/** Map the sort menu key to the workspace sort field and order. */
export function resolveSortOptions(sortBy) {
  let sortField = "updatedAt";
  let sortOrder = "desc";
  if (sortBy === "oldest") {
    sortField = "updatedAt";
    sortOrder = "asc";
  } else if (sortBy === "nameAsc") {
    sortField = "name";
    sortOrder = "asc";
  } else if (sortBy === "nameDesc") {
    sortField = "name";
    sortOrder = "desc";
  }
  return { sortField, sortOrder };
}

/** Sort a merged file list in place by the resolved field and order. */
export function sortFileList(files, sortField, sortOrder) {
  files.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (sortField === "name") {
      valA = (a.name || "").toLowerCase();
      valB = (b.name || "").toLowerCase();
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    valA = valA || 0;
    valB = valB || 0;
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });
}

export const formatRelativeTime = (t, timestamp) => {
  if (!timestamp) return t("welcome.time.today");
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("welcome.time.justNow");
  if (mins < 60) return t("welcome.time.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("welcome.time.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("welcome.time.yesterday");
  if (days < 30) return t("welcome.time.daysAgo", { n: days });
  return new Date(timestamp).toLocaleDateString();
};

export const buildSortLabelMap = (t) => ({
  updatedAt: t("welcome.sort.lastModified"),
  oldest: t("welcome.sort.oldestModified"),
  nameAsc: t("welcome.sort.nameAsc"),
  nameDesc: t("welcome.sort.nameDesc"),
});
