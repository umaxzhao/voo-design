const LOCK_PREFIX = "voo-image-retention:";

export function holdPublicationOwner(
  ownerId,
  locks = globalThis.navigator?.locks,
) {
  if (!locks?.request) throw new Error("IMAGE_RETENTION_LOCKS_UNAVAILABLE");
  let release;
  let ready;
  let failed;
  const acquired = new Promise((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const completion = locks.request(
    `${LOCK_PREFIX}${ownerId}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        ready(null);
        return;
      }
      ready({ release, completion: () => completion });
      await held;
    },
  );
  completion.catch(failed);
  return acquired;
}

/** A free same-origin lock proves its context has gone; keep it until exact disposal commits. */
export async function retirePublicationOwners(request, ownIds, origin) {
  const owners = await request({ action: "list", origin });
  const held = [];
  const retired = [];
  const release = async () => {
    held.forEach((lock) => lock.release());
    await Promise.all(held.map((lock) => lock.completion()));
  };
  try {
    const grouped = new Map();
    for (const owner of owners) {
      if (!grouped.has(owner.ownerId)) grouped.set(owner.ownerId, []);
      grouped.get(owner.ownerId).push(owner);
    }
    for (const [ownerId, records] of grouped) {
      if (ownIds.has(ownerId)) continue;
      const lock = await holdPublicationOwner(ownerId);
      if (!lock) continue;
      held.push(lock);
      retired.push(
        ...records.map((owner) => ({
          ...owner,
          action: "dispose",
          expectedVersion: owner.version,
          version: owner.version + 1,
          retainedIds: [],
          pending: {},
        })),
      );
    }
    if (retired.length)
      await request({ action: "dispose", owners: retired, deferCleanup: true });
    // The caller holds these locks through its destructive cleanup transaction.
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}
