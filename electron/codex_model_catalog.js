function capabilitiesUnavailable() {
  return new Error("cli.modelCapabilitiesUnavailable");
}

function modelCapabilities(value) {
  const id = value?.model ?? value?.id;
  const efforts = value?.supportedReasoningEfforts;
  if (
    typeof id !== "string" ||
    !id ||
    !Array.isArray(efforts) ||
    typeof value.defaultReasoningEffort !== "string" ||
    !value.defaultReasoningEffort ||
    efforts.some(
      (effort) =>
        typeof effort?.reasoningEffort !== "string" || !effort.reasoningEffort,
    )
  )
    throw capabilitiesUnavailable();
  return {
    id,
    label: value.displayName || id,
    hidden: value.hidden === true,
    supportedReasoningEfforts: [
      ...new Set(efforts.map((effort) => effort.reasoningEffort)),
    ],
    defaultReasoningEffort: value.defaultReasoningEffort,
  };
}

/** Native capabilities are cached per connection, including concurrent callers. */
export function createCodexModelCatalog(connection) {
  let cached = null;
  let expiresAt = 0;
  async function load() {
    const models = new Map();
    const cursors = new Set();
    let cursor;
    do {
      const page = await connection.call("model/list", {
        includeHidden: true,
        limit: 100,
        ...(cursor && { cursor }),
      });
      if (!Array.isArray(page?.data)) throw capabilitiesUnavailable();
      for (const value of page.data) {
        const model = modelCapabilities(value);
        models.set(model.id, model);
      }
      cursor = page.nextCursor;
      if (
        cursor != null &&
        (typeof cursor !== "string" || !cursor || cursors.has(cursor))
      )
        throw capabilitiesUnavailable();
      cursors.add(cursor);
    } while (cursor);
    return [...models.values()];
  }
  return () => {
    if (!cached || Date.now() >= expiresAt) {
      expiresAt = Infinity;
      cached = load()
        .catch(() => {
          // Metadata failures must be retryable while the authenticated native
          // connection remains healthy; never permanently cache a rejection.
          cached = null;
          throw capabilitiesUnavailable();
        })
        .then((models) => {
          expiresAt = Date.now() + 5 * 60 * 1000;
          return models;
        });
    }
    return cached;
  };
}

export function validateCodexReasoningEffort(models, modelId, effort) {
  if (effort === undefined) return;
  if (typeof effort !== "string" || !effort)
    throw new Error("cli.invalidReasoningEffort");
  const model = models.find((item) => item.id === modelId);
  if (!model) throw capabilitiesUnavailable();
  if (!model.supportedReasoningEfforts.includes(effort))
    throw new Error("cli.invalidReasoningEffort");
}
