/** Versioned publication intents. Graph saves must never acknowledge these implicitly. */
export class ImageRetentionConflict extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageRetentionConflict";
    this.code = "IMAGE_RETENTION_CONFLICT";
  }
}

function validateIds(ids) {
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new TypeError("Invalid retained image IDs");
  }
  return [...new Set(ids)];
}

export function applyImageRetention(
  workflow,
  update,
  { allowSameVersion = false } = {},
) {
  if (!workflow || workflow.id !== update.workflowId) {
    throw new ImageRetentionConflict("Publication workflow no longer exists");
  }
  const { ownerId, epoch, origin, version, action } = update;
  if (
    !ownerId ||
    !epoch ||
    typeof origin !== "string" ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new TypeError("Invalid image retention owner/version");
  }
  if (!["begin", "publish", "rollback", "dispose"].includes(action)) {
    throw new TypeError("Invalid image retention action");
  }
  const owners = workflow.assetRetentions ?? {};
  const previous = owners[ownerId];
  if (
    previous &&
    update.expectedVersion !== undefined &&
    previous.version !== update.expectedVersion
  ) {
    throw new ImageRetentionConflict("Retention changed before owner disposal");
  }
  if (
    allowSameVersion &&
    previous &&
    previous.epoch === epoch &&
    !previous.disposed &&
    previous.version === version
  ) {
    const expected = {
      epoch,
      origin,
      version,
      disposed: false,
      retainedIds: validateIds(update.retainedIds ?? []),
      pending: update.pending ?? {},
    };
    if (JSON.stringify(previous) !== JSON.stringify(expected)) {
      throw new ImageRetentionConflict(
        "Conflicting publication at the same version",
      );
    }
    return workflow;
  }

  if (
    previous &&
    (previous.epoch !== epoch ||
      previous.origin !== origin ||
      previous.disposed ||
      version <= previous.version)
  ) {
    throw new ImageRetentionConflict("Stale or disposed image retention owner");
  }
  if (!previous && action !== "begin") {
    throw new ImageRetentionConflict("Image retention owner has not begun");
  }
  const completed = new Set(update.completedTokens ?? []);
  const pending = Object.fromEntries(
    Object.entries(update.pending ?? {}).map(([token, ids]) => {
      if (!token) throw new TypeError("Invalid publication token");
      return [token, validateIds(ids)];
    }),
  );
  // A newer snapshot is not permission to drop an unacknowledged concurrent write.
  for (const token of Object.keys(previous?.pending ?? {})) {
    if (!(token in pending) && !completed.has(token) && action !== "dispose") {
      throw new ImageRetentionConflict(
        "Publication token was not explicitly completed",
      );
    }
  }
  const next =
    action === "dispose"
      ? { epoch, origin, version, disposed: true, retainedIds: [], pending: {} }
      : {
          epoch,
          origin,
          version,
          disposed: false,
          retainedIds: validateIds(update.retainedIds ?? []),
          pending,
        };
  return { ...workflow, assetRetentions: { ...owners, [ownerId]: next } };
}

export function publicationImageIds(workflow) {
  const ids = new Set();
  for (const owner of Object.values(workflow.assetRetentions ?? {})) {
    if (owner.disposed) continue;
    validateIds(owner.retainedIds ?? []).forEach((id) => ids.add(id));
    for (const pending of Object.values(owner.pending ?? {})) {
      validateIds(pending).forEach((id) => ids.add(id));
    }
  }
  return ids;
}
