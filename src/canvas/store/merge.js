/**
 * Three-way merge for a workflow document.
 *
 * The same workflow can be open in several canvases at once — a side panel, an
 * in-page floating window, a standalone tab — and each one holds its own copy.
 * Whole-document writes alone would make the last writer win, so a canvas that
 * had been sitting on a stale copy could put the previous picture back after
 * another canvas had just generated a new one.
 *
 * Merging is per node and per edge, against the snapshot both copies started
 * from (`base`). An item only one side touched keeps that side's version, so a
 * stale copy can no longer undo anything it did not itself change.
 */

/** Structural equality is enough here: nodes and edges are plain JSON. */
function unchanged(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function indexById(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

/**
 * Merges two divergent lists of `{ id }` items.
 *
 * Local order wins so the writing canvas never sees its own items jump around;
 * items only the remote copy has are appended.
 *
 * Deletions beat edits: removing a node is an explicit act by the user, while
 * the competing edit is often nothing more than a position nudge.
 */
export function mergeById(base, local, remote) {
  const baseMap = indexById(base);
  const localMap = indexById(local);
  const remoteMap = indexById(remote);
  const merged = [];

  for (const item of local ?? []) {
    const baseItem = baseMap.get(item.id);
    const remoteItem = remoteMap.get(item.id);

    if (!remoteItem) {
      // Absent remotely: a deletion over there if it used to exist, otherwise
      // an addition over here.
      if (!baseItem) merged.push(item);
      continue;
    }
    // A result update and a prompt/position change must not overwrite one
    // another. The shared base lets mergeNode retain both changes.
    merged.push(mergeNode(baseItem, item, remoteItem));
  }

  for (const item of remote ?? []) {
    if (localMap.has(item.id)) continue;
    // Missing locally: keep it only if it is new over there. If it was in the
    // base snapshot, this canvas deleted it.
    if (!baseMap.has(item.id)) merged.push(item);
  }

  return merged;
}

/** Picks the side that moved away from the base snapshot, preferring local. */
function mergeValue(base, local, remote) {
  return unchanged(local, base) ? remote : local;
}

function mergeObjectFields(base, local, remote) {
  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(remote ?? {}),
  ]);
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      mergeValue(base?.[key], local?.[key], remote?.[key]),
    ]),
  );
}

/**
 * Merges a node field-by-field when both canvases edited different parts of it.
 *
 * A generation result and its prompt commonly change in different canvases at
 * nearly the same time. Treating the whole node as one value lets a prompt
 * edit put an old `results` array back on the canvas. Data fields are
 * independent, so merge each one against the shared base instead.
 */
function mergeNode(base, local, remote) {
  if (!base && unchanged(local, remote)) return local;

  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(remote ?? {}),
  ]);
  const merged = {};

  keys.forEach((key) => {
    if (key === "data") {
      const dataKeys = new Set([
        ...Object.keys(base?.data ?? {}),
        ...Object.keys(local?.data ?? {}),
        ...Object.keys(remote?.data ?? {}),
      ]);
      merged.data = {};
      dataKeys.forEach((dataKey) => {
        if (dataKey === "editorDoc") {
          merged.data.editorDoc = mergeEditorDocuments(
            base?.data?.editorDoc,
            local?.data?.editorDoc,
            remote?.data?.editorDoc,
          );
          return;
        }
        if (!base) {
          merged.data[dataKey] =
            remote?.data?.[dataKey] ?? local?.data?.[dataKey];
        } else {
          merged.data[dataKey] = mergeValue(
            base?.data?.[dataKey],
            local?.data?.[dataKey],
            remote?.data?.[dataKey],
          );
        }
      });
      return;
    }
    if (!base) {
      merged[key] = local?.[key] ?? remote?.[key];
    } else {
      merged[key] = mergeValue(base?.[key], local?.[key], remote?.[key]);
    }
  });

  return merged;
}

/**
 * Merges the picture editor's own document, layer by layer.
 *
 * `editorDoc` hangs off an image-editor node's `data`, so without this it is
 * one atomic value: two people working on the same picture — one dragging a
 * layer, the other adjusting a different one — would have whichever side wrote
 * last replace the other's work wholesale. Its layers carry ids, so the very
 * same per-item merge the workflow uses applies one level down.
 *
 * Order is the paint order, and mergeById keeps the local one; a layer only
 * the other side has lands on top, which is where a newly added layer belongs.
 */
export function mergeEditorDocuments(base, local, remote) {
  // One side has no editor document at all (never opened, or cleared): there
  // is nothing to merge into, so fall back to picking a side.
  if (!local || !remote) return mergeValue(base, local, remote);

  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const merged = {};
  keys.forEach((key) => {
    if (key === "nodes") {
      merged.nodes = mergeById(base?.nodes, local.nodes, remote.nodes);
      return;
    }
    merged[key] = mergeValue(base?.[key], local[key], remote[key]);
  });
  return merged;
}

/**
 * Merges a stored document into the local copy.
 *
 * @param {object} base - the document as both copies last saw it
 * @param {object} local - this canvas's current document
 * @param {object} remote - the document another canvas just wrote
 */
export function mergeWorkflowDocuments(base, local, remote) {
  const projectBrief = mergeObjectFields(
    base?.projectBrief,
    local?.projectBrief,
    remote?.projectBrief,
  );
  projectBrief.brand = mergeObjectFields(
    base?.projectBrief?.brand,
    local?.projectBrief?.brand,
    remote?.projectBrief?.brand,
  );
  const localMemory = local?.projectMemory;
  const remoteMemory = remote?.projectMemory;
  const projectMemory =
    localMemory && remoteMemory
      ? {
          schemaVersion: mergeValue(
            base?.projectMemory?.schemaVersion,
            localMemory.schemaVersion,
            remoteMemory.schemaVersion,
          ),
          items: mergeById(
            base?.projectMemory?.items,
            localMemory.items,
            remoteMemory.items,
          ),
        }
      : mergeValue(base?.projectMemory, localMemory, remoteMemory);
  const room = mergeValue(
    { roomId: base?.roomId ?? null, roomCreatedAt: base?.roomCreatedAt ?? 0 },
    { roomId: local?.roomId ?? null, roomCreatedAt: local?.roomCreatedAt ?? 0 },
    {
      roomId: remote?.roomId ?? null,
      roomCreatedAt: remote?.roomCreatedAt ?? 0,
    },
  );
  return {
    name: mergeValue(base?.name ?? "", local?.name ?? "", remote?.name ?? ""),
    nodes: mergeById(base?.nodes, local?.nodes, remote?.nodes),
    edges: mergeById(base?.edges, local?.edges, remote?.edges),
    settings: {
      ...(remote?.settings ?? {}),
      ...mergeValue(
        base?.settings ?? {},
        local?.settings ?? {},
        remote?.settings ?? {},
      ),
    },
    projectBrief,
    projectMemory,
    ...room,
  };
}

/** True when this canvas holds edits the stored document does not have yet. */
export function hasLocalChanges(base, local) {
  return (
    !unchanged(base?.nodes ?? [], local?.nodes ?? []) ||
    !unchanged(base?.edges ?? [], local?.edges ?? []) ||
    !unchanged(base?.name ?? "", local?.name ?? "") ||
    !unchanged(base?.settings ?? {}, local?.settings ?? {}) ||
    !unchanged(base?.projectBrief ?? null, local?.projectBrief ?? null) ||
    !unchanged(base?.projectMemory ?? null, local?.projectMemory ?? null) ||
    !unchanged(base?.roomId ?? null, local?.roomId ?? null) ||
    !unchanged(base?.roomCreatedAt ?? 0, local?.roomCreatedAt ?? 0)
  );
}
