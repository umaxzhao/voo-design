import { DEFAULT_IMAGE_PLATFORM } from "../../shared/agent-defaults.js";
import {
  RUN_STATUS,
  migrateNodes,
  pruneOrphanEdges,
  stripTransientNodeState,
} from "../nodes/types.js";
import { persistWorkflow } from "./library.js";
import { getImageDataUrls, loadWorkflow } from "./db.js";
import { announceWrite } from "./sync.js";
import { generationOrder, referencedImageIds } from "../engine/graph_run.js";
import { DEFAULT_API_CONCURRENCY } from "../../shared/concurrency.js";
import { enqueueDocumentSave } from "./save-queue.js";

const AUTOSAVE_DELAY = 600;
let saveTimer = null;

/**
 * The write-ahead mirror of a debounced save runs synchronously on every
 * scheduleSave call, and a run or a typing burst calls scheduleSave many
 * times per second — serializing the whole document on each call shows up on
 * large graphs. Writes are throttled: the first call writes immediately,
 * calls inside the window coalesce into one trailing write, so the mirror is
 * at most one interval behind (still far fresher than the 600 ms IndexedDB
 * debounce it protects).
 */
export const WRITE_AHEAD_INTERVAL_MS = 250;
const writeAheadTimers = new Map();
const writeAheadWrittenAt = new Map();

/**
 * Write-ahead of the pending autosave, held in localStorage so it survives a
 * refresh/close that kills the page before the debounced IndexedDB write
 * lands. localStorage.setItem is synchronous — the one thing guaranteed to
 * complete before the page is torn down. Boot replays it when the stored
 * document is behind (see reconcilePendingDoc / ensurePendingDocStored).
 */
const WRITE_AHEAD_KEY = "voo.pendingDoc";
const pendingKey = (workflowId) =>
  `${WRITE_AHEAD_KEY}:${encodeURIComponent(workflowId)}`;

function readStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Latest snapshot of an unsaved document, or null. Never throws. */
export function readPendingDoc(workflowId) {
  if (!workflowId) return null;
  try {
    const storage = readStorage();
    const raw =
      storage?.getItem(pendingKey(workflowId)) ??
      storage?.getItem(WRITE_AHEAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.workflowId !== workflowId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listPendingWorkflowIds() {
  const ids = new Set();
  try {
    const storage = readStorage();
    if (!storage) return [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(`${WRITE_AHEAD_KEY}:`)) continue;
      const workflowId = decodeURIComponent(
        key.slice(WRITE_AHEAD_KEY.length + 1),
      );
      if (readPendingDoc(workflowId)) ids.add(workflowId);
    }
    const legacy = storage.getItem(WRITE_AHEAD_KEY);
    if (legacy) {
      const workflowId = JSON.parse(legacy)?.workflowId;
      if (typeof workflowId === "string") ids.add(workflowId);
    }
  } catch {
    // Storage may be unavailable; normal IndexedDB loading still proceeds.
  }
  return [...ids];
}

function writePendingDoc(workflowId, get) {
  if (!workflowId) return;
  try {
    const doc = snapshotDocument(get);
    if (!doc) return;
    readStorage()?.setItem(
      pendingKey(workflowId),
      JSON.stringify({ workflowId, rev: get().rev ?? 0, ...doc }),
    );
  } catch {
    // Quota or storage unavailable — the debounced IndexedDB write is still
    // the path; the write-ahead is only a refresh/close safety net.
  }
}

export function clearPendingDoc(workflowId) {
  if (!workflowId) return;
  const timer = writeAheadTimers.get(workflowId);
  if (timer !== undefined) clearTimeout(timer);
  writeAheadTimers.delete(workflowId);
  try {
    const storage = readStorage();
    storage?.removeItem(pendingKey(workflowId));
    const legacy = storage?.getItem(WRITE_AHEAD_KEY);
    if (legacy && JSON.parse(legacy)?.workflowId === workflowId) {
      storage.removeItem(WRITE_AHEAD_KEY);
    }
  } catch {
    // Nothing to clear — a failed remove leaves a stale write-ahead that boot
    // simply reconciles away (it compares revs and contents).
  }
}

function pendingMatchesStored(pending, stored) {
  return (
    (pending?.name ?? "") === (stored?.name ?? "") &&
    JSON.stringify(pending?.nodes ?? []) ===
      JSON.stringify(stored?.nodes ?? []) &&
    JSON.stringify(pending?.edges ?? []) ===
      JSON.stringify(stored?.edges ?? []) &&
    JSON.stringify(pending?.settings ?? {}) ===
      JSON.stringify(stored?.settings ?? {}) &&
    JSON.stringify(pending?.projectBrief ?? null) ===
      JSON.stringify(stored?.projectBrief ?? null) &&
    JSON.stringify(pending?.projectMemory ?? null) ===
      JSON.stringify(stored?.projectMemory ?? null) &&
    // Older write-ahead snapshots did not contain the share binding. A field
    // absent from that format must not erase a binding already on disk.
    (!Object.hasOwn(pending ?? {}, "roomId") ||
      (pending.roomId ?? null) === (stored?.roomId ?? null)) &&
    (!Object.hasOwn(pending ?? {}, "roomCreatedAt") ||
      (pending.roomCreatedAt ?? 0) === (stored?.roomCreatedAt ?? 0))
  );
}

function pendingDocumentForPersistence(workflowId, pending, stored) {
  return {
    id: workflowId,
    name: pending.name ?? "",
    nodes: pending.nodes ?? [],
    edges: pending.edges ?? [],
    settings: pending.settings ?? {},
    roomId: Object.hasOwn(pending, "roomId")
      ? (pending.roomId ?? null)
      : (stored?.roomId ?? null),
    roomCreatedAt: Object.hasOwn(pending, "roomCreatedAt")
      ? (pending.roomCreatedAt ?? 0)
      : (stored?.roomCreatedAt ?? 0),
    ...(pending.projectBrief ? { projectBrief: pending.projectBrief } : {}),
    ...(pending.projectMemory ? { projectMemory: pending.projectMemory } : {}),
  };
}

/**
 * Writes any pending write-ahead for this workflow into storage, when it
 * carries changes the stored document does not have yet.
 *
 * Called on boot BEFORE the workflow list is read, so a workflow that was
 * open when the page died (and never written, or written before its last
 * edits) is restored by the normal load path instead of being missing.
 */
export async function ensurePendingDocStored(workflowId) {
  const pending = readPendingDoc(workflowId);
  if (!pending || pending.workflowId !== workflowId) return;
  const stored = await loadWorkflow(workflowId);
  const storedRev = stored?.rev ?? 0;
  const pendingRev = pending.rev ?? 0;
  const storedIsAhead = storedRev > pendingRev;
  const storedMatches = pendingMatchesStored(pending, stored);
  if (storedIsAhead || storedMatches) {
    clearPendingDoc(workflowId);
    return;
  }
  const outcome = await persistWorkflow(
    pendingDocumentForPersistence(workflowId, pending, stored),
    { expectedRev: storedRev },
  );
  // Only a landed write retires the write-ahead; a losing race leaves it for
  // the next boot to retry against whatever storage moved to.
  if (outcome.ok) clearPendingDoc(workflowId);
}

/**
 * Reconciles the loaded stored document against any pending write-ahead:
 * returns the pending document when it is newer (or carries unsaved changes),
 * the stored document otherwise. The write-ahead is cleared either way.
 */
export async function reconcilePendingDoc(workflowId, stored) {
  const pending = readPendingDoc(workflowId);
  if (!pending || pending.workflowId !== workflowId) return stored;
  const storedRev = stored?.rev ?? 0;
  const pendingRev = pending.rev ?? 0;
  if (storedRev > pendingRev || pendingMatchesStored(pending, stored)) {
    clearPendingDoc(workflowId);
    return stored;
  }
  const document = pendingDocumentForPersistence(workflowId, pending, stored);
  const outcome = await persistWorkflow(document, { expectedRev: storedRev });
  // A losing race (a sibling wrote between the read and this write) keeps the
  // write-ahead so the next boot retries; only a landed write retires it.
  if (!outcome.ok) return stored;
  clearPendingDoc(workflowId);
  return {
    ...pending,
    ...document,
    rev: outcome.rev,
  };
}

/**
 * How many times one save may re-merge and retry.
 *
 * Each attempt only loses to a canvas that wrote in the meantime, so a couple
 * of rounds is plenty; the cap is there so a pathological write loop in
 * another panel cannot spin this one forever.
 */
const SAVE_RETRIES = 3;

/** The document shape that goes to storage — transient UI state removed. */
export function snapshotDocument(get) {
  const {
    name,
    nodes,
    edges,
    settings,
    roomId,
    roomCreatedAt,
    projectBrief,
    projectMemory,
  } = get();
  return {
    name,
    nodes: stripTransientNodeState(nodes),
    edges,
    settings,
    roomId: roomId ?? null,
    roomCreatedAt: roomCreatedAt ?? 0,
    ...(projectBrief ? { projectBrief } : {}),
    ...(projectMemory ? { projectMemory } : {}),
  };
}

/**
 * Byte budget for the generated-asset library. Nothing else bounds it — the
 * library deliberately keeps pictures their nodes no longer reference — so the
 * cap is what stops IndexedDB from growing without end. Adjustable in settings.
 */
export const DEFAULT_ASSET_LIBRARY_MAX_BYTES = 500 * 1024 * 1024;

export const DEFAULT_SETTINGS = {
  timeoutMs: 300000,
  settleMs: 1800,
  autoScroll: true,
  enableCollab: true,
  starterInitialized: false,
  assetLibraryMaxBytes: DEFAULT_ASSET_LIBRARY_MAX_BYTES,
  // Default web platform for newly created Design nodes.
  layoutDefaultPlatform: DEFAULT_IMAGE_PLATFORM,
  // Ask mode: confirm runs that bill remote calls before they start.
  askBeforeRun: false,
  // Continue-on-error: keep running downstream nodes after a failure.
  continueOnError: false,
  // How many API generation jobs run at once. 1 = strictly serial, which is
  // what a large batch against a rate-limited provider wants.
  apiConcurrency: DEFAULT_API_CONCURRENCY,
};

export const IDLE_RUN = {
  status: "idle",
  stopRequested: false,
  error: null,
  resumeFrom: null,
  activeNodeId: null,
  pendingRequest: null,
  failedNodeIds: [],
  runOwner: null,
  recoverableExecutionId: null,
  recovery: null,
};

/**
 * Writes the open document, folding in anything another canvas wrote first.
 *
 * The write is conditional on the revision this canvas last saw. Losing that
 * race is normal rather than exceptional — it just means a sibling canvas saved
 * while we were editing — so the loser adopts the stored document, replays its
 * own changes on top, and writes again.
 */
async function writeCurrent(get, workflowId) {
  if (!workflowId || get().workflowId !== workflowId) return;

  for (let attempt = 0; attempt < SAVE_RETRIES; attempt += 1) {
    const document = snapshotDocument(get);
    const outcome = await persistWorkflow(
      { id: workflowId, ...document },
      { expectedRev: get().rev },
    );
    // A completed write belongs to the document it captured. Never advance
    // another project's revision or merge this snapshot after a switch.
    if (get().workflowId !== workflowId) return;

    if (outcome.ok) {
      get().markSynced(document, outcome.rev);
      get().setSaveError(false);
      announceWrite(workflowId, outcome.rev);
      // This acknowledgement may describe earlier progress. Keep newer
      // results crash-safe until the queued completion write reaches disk.
      if (pendingMatchesStored(document, snapshotDocument(get))) {
        if (readPendingDoc(workflowId)) clearPendingDoc(workflowId);
      } else {
        writePendingDoc(workflowId, get);
      }
      // The picker only shows name/nodeCount/updatedAt of each workflow, and
      // a save by definition knows all three for the open one — patching the
      // row locally avoids re-reading every stored workflow per autosave.
      get().patchLibrarySummary(workflowId, {
        name: document.name,
        nodeCount: document.nodes.length,
        updatedAt: Date.now(),
      });
      // Desktop client: keep the bound project folder in step. Best-effort —
      // the IndexedDB write above is the source of truth, and a folder failure
      // must not surface as a save error the user cannot act on.
      void writeToProjectFolder(get).catch(() => {});
      return;
    }

    await get().adoptRemoteDocument(outcome.stored);
    // The document being saved has moved on; the next pass re-snapshots it.
    if (get().workflowId !== workflowId) return;
  }

  // Still losing the race after several rounds: the graph stays editable, but
  // the user must be told it is not on disk.
  get().setSaveError(true);
}

/**
 * Desktop client: mirrors the saved document into the bound project folder
 * (workflow.json at the root plus the pictures). Generated results land in
 * `output/`, reference/input pictures in `images/`, so a project folder shows
 * the work it produced separately from what it was fed. The renderer cannot
 * touch the disk, so the payload crosses to the main process — and a failure
 * here is deliberately swallowed: IndexedDB is the authoritative save.
 * Exported for tests.
 */
export async function writeToProjectFolder(get) {
  const { projectRoot, nodes } = get();
  const write = globalThis.vooElectron?.writeWorkflowJson;
  if (!projectRoot || !write) return;
  const document = snapshotDocument(get);
  // An image is an output when a generate node produced it or a gallery holds
  // it; everything else the document references is an input/reference picture.
  const outputIds = new Set();
  for (const node of nodes) {
    const data = node.data ?? {};
    for (const id of data.results ?? []) outputIds.add(id);
    for (const id of data.imageIds ?? []) outputIds.add(id);
  }
  // The in-memory images map holds blob: object URLs — undeliverable over IPC
  // and unserializable on disk, which left project folders with an empty
  // images map and no picture files. Read the real bytes as data URLs instead
  // (the header of image_cache.js reserves exactly this for transport paths).
  const images = await getImageDataUrls(referencedImageIds(nodes));
  await write(
    projectRoot,
    { ...document, images },
    {
      outputIds: [...outputIds],
    },
  );
}

/**
 * Mirrors the pending snapshot to localStorage, throttled to at most one
 * write per interval: leading write is immediate, calls inside the window
 * coalesce into a single trailing write. The workflow id is read again at
 * fire time so a trailing write always keys the document that is open then.
 */
function scheduleWriteAhead(get) {
  const workflowId = get().workflowId;
  if (!workflowId) return;
  const elapsed = Date.now() - (writeAheadWrittenAt.get(workflowId) ?? 0);
  if (elapsed >= WRITE_AHEAD_INTERVAL_MS) {
    writeAheadWrittenAt.set(workflowId, Date.now());
    writePendingDoc(workflowId, get);
    return;
  }
  if (writeAheadTimers.has(workflowId)) return;
  const timer = setTimeout(() => {
    writeAheadTimers.delete(workflowId);
    writeAheadWrittenAt.set(workflowId, Date.now());
    if (get().workflowId === workflowId) writePendingDoc(workflowId, get);
  }, WRITE_AHEAD_INTERVAL_MS - elapsed);
  writeAheadTimers.set(workflowId, timer);
}

/** Debounced autosave — dragging a node must not rewrite the document per frame. */
export function scheduleSave(get, { immediate = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  const write = () => {
    saveTimer = null;
    return enqueueDocumentSave(get, writeCurrent);
  };
  if (immediate) return write();
  // The debounced write may never fire if the page goes away first — a
  // refresh right after adding/editing a node would lose the change. Mirror
  // the pending snapshot to localStorage synchronously so boot can replay it.
  scheduleWriteAhead(get);
  saveTimer = setTimeout(write, AUTOSAVE_DELAY);
  return Promise.resolve();
}

/**
 * Writes any autosave still sitting in the debounce window, immediately.
 *
 * The 600 ms debounce that keeps node drags from rewriting the document per
 * frame also means a page that goes away right after a change — refresh,
 * closing the tab, navigating away — can take the unsaved change with it:
 * the stored workflow never sees the node, so it comes back missing after
 * reload. Register this on `pagehide` / `visibilitychange(hidden)` so the
 * write is underway before the page is torn down (the async IndexedDB write
 * survives the hidden transition; a `beforeunload`-only flush would not).
 */
export function flushPendingSave(get) {
  // A pending trailing write-ahead fires now, synchronously — this is the
  // last chance to capture changes the debounce has not mirrored yet.
  const workflowId = get().workflowId;
  const writeAheadTimer = writeAheadTimers.get(workflowId);
  if (writeAheadTimer !== undefined) {
    clearTimeout(writeAheadTimer);
    writeAheadTimers.delete(workflowId);
    writeAheadWrittenAt.set(workflowId, Date.now());
    writePendingDoc(workflowId, get);
  }
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  void enqueueDocumentSave(get, writeCurrent);
}

/**
 * Clears stale execution UI and reports where an interrupted run stopped.
 *
 * Migration can drop nodes whose type no longer exists, so the edges are
 * returned alongside them with any wire to a dropped node removed.
 */
export function healInterruptedNodes(rawNodes, rawEdges) {
  const nodes = migrateNodes(rawNodes, rawEdges);
  const interruptedIds = new Set(
    nodes
      .filter(
        (node) =>
          node.data?.status === RUN_STATUS.RUNNING ||
          node.data?.status === RUN_STATUS.PENDING,
      )
      .map((node) => node.id),
  );
  const healed = nodes.map((node) =>
    node.data?.status === RUN_STATUS.RUNNING ||
    node.data?.status === RUN_STATUS.PENDING ||
    node.data?.status === RUN_STATUS.ERROR
      ? {
          ...node,
          data: {
            ...node.data,
            status: RUN_STATUS.IDLE,
            stage: null,
            error: null,
          },
        }
      : node,
  );
  const sortedHealed = [
    ...healed.filter((node) => !node.parentNode),
    ...healed.filter((node) => Boolean(node.parentNode)),
  ];
  // The resume point is the first interrupted node in execution order, so
  // resuming replays it and everything downstream. PENDING counts as
  // interrupted too: a page that died between queueing the run and the first
  // node actually starting leaves every queued node PENDING, with no RUNNING
  // marker to resume from.
  let resumeFrom = null;
  if (interruptedIds.size > 0) {
    const { order } = generationOrder(nodes, rawEdges);
    resumeFrom = order.find((id) => interruptedIds.has(id)) ?? null;
  }
  return {
    healed: sortedHealed,
    edges: pruneOrphanEdges(sortedHealed, rawEdges),
    resumeFrom,
  };
}
