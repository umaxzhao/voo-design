/**
 * What actually travels between peers: the document, the pictures it needs,
 * and the strokes painted into it.
 *
 * The session owns *who* is connected; this owns *what* they exchange. Keeping
 * them apart is what lets the roster and the transport be tested without a
 * store, and this without a socket.
 *
 * Three rules shape everything here:
 *
 *  - The document is small and travels whole, then goes through the same
 *    three-way merge two canvases on one machine already use. There is no
 *    separate conflict story for collaboration.
 *  - Images are large and content-addressed, so they are never diffed: a peer
 *    says which ids it holds, the other asks for the ones it lacks. That is
 *    the entire sync algorithm, and it is why joining a session costs one
 *    transfer of what you are missing and nothing thereafter.
 *  - A brush stroke ships as the stroke, not as the resulting pixels. Replaying
 *    a few hundred points costs kilobytes where the mask it produces costs
 *    megabytes.
 */

import { CAP_BINARY_BLOBS, MSG, PROTOCOL_VERSION } from "./protocol.js";
import {
  BINARY_CHUNK_SIZE,
  CHUNK_SIZE,
  createByteReassembler,
  createReassembler,
  encodeBinaryFrame,
  splitPayload,
} from "./chunking.js";
import { emitRemoteStroke, onLocalStroke } from "./stroke_bus.js";
import { setCurrentWorkflowId } from "../store/library.js";
import { stripTransientNodeState } from "../nodes/types.js";
import {
  DEFAULT_API_CONCURRENCY,
  mapWithConcurrency,
} from "../../shared/concurrency.js";
import { processImageForWire } from "./blob_worker.js";

/** How long edits are gathered before the document goes out. */
const PUSH_DELAY_MS = 250;

/** How long image requests gather before going out. A newcomer hears from
 * every peer at once; waiting a beat lets everyone's BLOB_HAVE land first,
 * so the requests can spread across holders instead of all landing on
 * whoever's document arrived first.
 */
const WANT_DELAY_MS = 150;

/**
 * How long a burst of incoming images waits before the document is re-adopted.
 *
 * Every image that lands is stored immediately, but re-adopting the document
 * is what makes it render — and adopting re-hydrates every referenced image
 * (IndexedDB reads, object-URL creation, merge, persist) plus a full-canvas
 * repaint. Doing that once per image, for a workflow with a dozen pictures,
 * re-does that whole cost a dozen times. Coalescing the re-adoption onto the
 * tail of a burst turns "a dozen full rebuilds" into "one", so a library of
 * images pops in together instead of stuttering one picture at a time.
 */
const RE_ADOPT_DELAY_MS = 200;
export { RE_ADOPT_DELAY_MS };

/**
 * Reference images in a generation workflow are usually several MB of pixel
 * data; a viewer only needs the content at screen resolution for the initial
 * load. Cap the transfer so a dozen pictures arrive in a second instead of a
 * minute. The editor re-fetches the original on demand (a follow-up) — this is
 * the fast first paint.
 */
export const MAX_IMAGE_DIM = 800;
export const IMAGE_QUALITY = 0.75;
export const COMPRESS_THRESHOLD_BYTES = 64 * 1024;

/**
 * Best-effort downscale of an image blob for the wire. Only images over the
 * size/dimension budget are re-encoded; anything smaller, non-image, or that
 * fails to decode goes out as-is. Returns the original blob when nothing is
 * worth changing.
 */
export async function compressImage(
  blob,
  {
    maxDimension = MAX_IMAGE_DIM,
    quality = IMAGE_QUALITY,
    threshold = COMPRESS_THRESHOLD_BYTES,
  } = {},
) {
  if (!blob || typeof createImageBitmap !== "function") return blob;
  if (!/^image\//.test(blob.type || "")) return blob;
  if (blob.size <= threshold) return blob;
  const bitmap = await createImageBitmap(blob);
  let result = blob;
  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    if (scale < 1 || blob.size > threshold) {
      const outW = Math.max(1, Math.round(bitmap.width * scale));
      const outH = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(outW, outH);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, outW, outH);
      let out = null;
      try {
        out = await canvas.convertToBlob({ type: "image/webp", quality });
      } catch {
        // Fallback to JPEG if WebP is unsupported
        out = await canvas.convertToBlob({ type: "image/jpeg", quality });
      }
      if (out && out.size < blob.size) result = out;
    }
  } catch {
    // Best-effort: a decode/encode failure must never break the transfer.
  } finally {
    bitmap.close();
  }
  return result;
}

/**
 * The image ids a document needs that this peer does not have.
 *
 * Pure, so the interesting case — a peer joining a session whose pictures it
 * has never seen — is testable without a database.
 */
export function missingImageIds(referenced, held) {
  const have = held instanceof Set ? held : new Set(held ?? []);
  return [...new Set(referenced ?? [])].filter((id) => id && !have.has(id));
}

/**
 * Connects a session to the canvas store.
 *
 * @param {object} options
 * @param {object} options.session from createCollabSession.
 * @param {object} options.store   the workflow store (zustand-style).
 * @param {object} options.db      `{ getImageDataUrls, putImages }`.
 * @param {(nodes: Array) => Array<string>} options.referencedImageIds
 * @param {(get: Function) => object} options.snapshotDocument
 * @returns {() => void} detaches everything it attached.
 */
export function createDocumentBridge({
  session,
  store,
  db,
  referencedImageIds,
  snapshotDocument,
  onProgress,
  delay = PUSH_DELAY_MS,
  wantDelay = WANT_DELAY_MS,
  reAdoptDelay = RE_ADOPT_DELAY_MS,
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: unschedule = globalThis.clearTimeout,
}) {
  const reassembler = createReassembler();
  const byteReassembler = createByteReassembler();
  let pushTimer = 0;

  const sessionSnap = session?.getSnapshot?.() ?? {};
  const currentDoc = snapshotDocument(store.getState);
  const initialBase = {
    name: currentDoc?.name ?? "",
    nodes: stripTransientNodeState(currentDoc?.nodes ?? []),
    edges: currentDoc?.edges ?? [],
    settings: currentDoc?.settings ?? {},
  };
  if (typeof store.setState === "function") {
    store.setState({
      collabUserId: sessionSnap.selfId,
      collabReadOnly: Boolean(sessionSnap.readOnly),
      readOnly: Boolean(sessionSnap.readOnly),
      collabSession: session,
      collabBase: store.getState?.()?.collabBase ?? initialBase,
    });
  } else if (store.state) {
    store.state.collabUserId = sessionSnap.selfId;
    store.state.collabReadOnly = Boolean(sessionSnap.readOnly);
    store.state.collabSession = session;
    store.state.collabBase = store.state.collabBase ?? initialBase;
  }
  /**
   * Whether a push is already coming.
   *
   * Separate from the timer handle because the handle is only assigned after
   * `schedule` returns — a timer that fires synchronously would have its own
   * clean-up overwritten by that assignment, and no push would ever be
   * scheduled again.
   */
  let pushPending = false;
  /**
   * Coalesced re-adoption. A burst of incoming images calls reAdoptCurrent once
   * at the tail rather than once per image (see RE_ADOPT_DELAY_MS).
   */
  let adoptTimer = 0;
  let adoptPending = false;
  /**
   * The document as last sent or received.
   *
   * This is the echo guard: adopting a peer's document changes local state,
   * which would otherwise immediately push that same document back and leave
   * the two bouncing it between them forever.
   */
  let lastSeen = null;
  // Applying an incoming snapshot synchronously updates the store and can
  // notify subscribers before the async merge completes. Suppress that
  // re-entrant notification; the completed merge below decides whether a
  // genuinely divergent document needs a follow-up broadcast.
  let applyingRemote = false;

  const currentDocument = () => snapshotDocument(store.getState);

  function pushDocument(toPeerId) {
    if (applyingRemote && !toPeerId) return;
    const state = store.getState();
    if (!state.workflowId) return;
    // A read-only guest in a view-only room never shares its document — it is
    // not the source, so neither a broadcast nor a reply to a doc request.
    const currentSessionSnap = session.getSnapshot?.() ?? {};
    if (currentSessionSnap.readOnly) return;
    const document = currentDocument();
    const wire = JSON.stringify(document);
    if (!toPeerId && wire === lastSeen) return;
    lastSeen = wire;
    const payload = {
      workflowId: state.workflowId,
      document,
      rev: state.rev ?? 0,
    };
    if (toPeerId) {
      session.sendTo(toPeerId, MSG.DOC, payload);
    } else {
      session.broadcast(MSG.DOC, payload);
      // A broadcast is the acknowledgement boundary for local document
      // changes. Advance the collaboration anchor only after the snapshot has
      // actually been handed to the transport, never from the raw mutation
      // path where concurrent peer edits could be mistaken for deletions.
      const nextBase = {
        name: document.name ?? "",
        nodes: stripTransientNodeState(document.nodes ?? []),
        edges: document.edges ?? [],
        settings: document.settings ?? {},
      };
      // collabBase is an internal protocol anchor, not UI state. Mutating it
      // through setState would notify the store subscriber and schedule the
      // same document again, creating an unbounded broadcast loop.
      if (store.state) store.state.collabBase = nextBase;
      if (
        store.state &&
        (store.state.syncBase == null ||
          (store.state.syncBase.nodes?.length ?? 0) === 0)
      ) {
        // The first collaborative write establishes the shared document; later
        // writes must keep syncBase stable for three-way conflict merging.
        store.state.syncBase = nextBase;
      }
    }
  }

  function schedulePush() {
    if (pushPending) return;
    pushPending = true;
    // Coalesced: a drag is hundreds of state writes and one document worth
    // sending. The delay is what turns the former into the latter.
    pushTimer = schedule(() => {
      pushPending = false;
      pushDocument(null);
    }, delay);
  }

  /**
   * The resources currently authorized for sharing with peers in this room.
   * Derived from the room's active document nodes and attachments.
   * A peer knowing an ID does not give them permission to read it if it
   * is not referenced in the room's shared document (T09).
   */
  function getAuthorizedImageIds() {
    const currentNodes = store.getState()?.nodes ?? [];
    return new Set(referencedImageIds(currentNodes));
  }

  /**
   * Sends one image as numbered chunks; see chunking.js for why.
   *
   * Chunks go out back to back — no per-image waiting, so the pipe stays full
   * — but never faster than the peer's buffer drains: `whenWritable` pauses
   * the loop once the unsent backlog passes the transport's high-water mark.
   * Without that pause a whole library would queue in this tab's memory on a
   * slow link instead of trickling onto the wire.
   */
  async function sendImages(toPeerId, ids, { original = false } = {}) {
    if (!ids?.length || !toPeerId) return;
    if (session.isPeerKnown && !session.isPeerKnown(toPeerId)) return;
    const authorized = getAuthorizedImageIds();
    const allowedIds = ids.filter(
      (id) => typeof id === "string" && Boolean(id) && authorized.has(id),
    );
    if (!allowedIds.length) return;

    // Raw bytes on the wire when the peer can take them (a third less traffic,
    // no base64 either end); the data-URL chunks remain for peers on a build
    // that predates binary frames.
    const binary = session.peerSupports?.(toPeerId, CAP_BINARY_BLOBS) ?? false;
    if (binary) {
      // Images are stored as Blobs, so read them as Blobs and send their bytes
      // straight out. Going the getImageDataUrls route would base64-encode each
      // blob to a data URL and then base64-decode it again to bytes to send —
      // two full passes over the payload plus a synchronous atob per image, all
      // on the main thread. Six digits for a 5MB picture, for a dozen images,
      // before a byte even hits the wire.
      const blobs = (await db.getImageBlobMap?.(allowedIds)) ?? new Map();
      // Compress + transmit several images at once: downscaling is a decode →
      // resize → encode pass per image, and serialising every one of a dozen
      // makes the first-paint handoff feel like a wall. The sends already
      // backpressure on the data channel, so concurrency only overlaps the
      // (main-thread) compression work.
      await mapWithConcurrency(
        [...blobs.entries()],
        DEFAULT_API_CONCURRENCY,
        async ([id, blob]) => {
          if (!blob) return;
          // Try off-thread Web Worker compression & ArrayBuffer preparation first
          const processed = await processImageForWire(id, blob, {
            maxDimension: MAX_IMAGE_DIM,
            quality: IMAGE_QUALITY,
            threshold: COMPRESS_THRESHOLD_BYTES,
            original,
          });

          if (processed?.bytes) {
            await sendImageBytes(toPeerId, id, processed.mime, processed.bytes);
          } else {
            const wireBlob = original ? blob : await compressImage(blob);
            await sendImageBlob(toPeerId, id, wireBlob);
          }
        },
      );
      return;
    }
    const urls = await db.getImageDataUrls(allowedIds);
    for (const [id, dataUrl] of Object.entries(urls ?? {})) {
      if (!dataUrl) continue;
      for (const piece of splitPayload(dataUrl, CHUNK_SIZE)) {
        await session.whenWritable?.(toPeerId);
        session.sendTo(toPeerId, MSG.BLOB_DATA, {
          id,
          dataUrl: piece.chunk,
          ...piece,
        });
      }
    }
  }

  /** Sends pre-sliced Uint8Array bytes as binary frames (zero main-thread ArrayBuffer allocation). */
  async function sendImageBytes(toPeerId, id, mime, bytes) {
    const total = Math.max(1, Math.ceil(bytes.byteLength / BINARY_CHUNK_SIZE));
    for (let seq = 0; seq < total; seq += 1) {
      await session.whenWritable?.(toPeerId);
      const sent = session.sendRaw?.(
        toPeerId,
        encodeBinaryFrame(
          {
            t: MSG.BLOB_DATA,
            v: PROTOCOL_VERSION,
            id,
            seq,
            total,
            mime: mime ?? "image/png",
          },
          bytes.subarray(
            seq * BINARY_CHUNK_SIZE,
            (seq + 1) * BINARY_CHUNK_SIZE,
          ),
        ),
      );
      if (sent === false) return;
    }
  }

  /** Sends one Blob as binary frames; the counterpart of the string chunk loop. */
  async function sendImageBlob(toPeerId, id, blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await sendImageBytes(toPeerId, id, blob.type ?? "image/png", bytes);
  }

  /**
   * Re-rendering after an image lands: the picture is in storage now, but the
   * canvas is holding the document that referenced it; re-adopting is what
   * makes it appear.
   */
  async function reAdoptCurrent() {
    const state = store.getState();
    await state.adoptRemoteDocument(
      {
        id: state.workflowId,
        rev: state.rev ?? 0,
        ...currentDocument(),
      },
      undefined,
      { source: "rehydration" },
    );
  }

  /** Receive progress for the UI: per-image chunk counts and a done tally. */
  const incoming = new Map();
  let imagesDone = 0;

  /**
   * Re-adopts the document once a burst of image arrivals settles, instead of
   * on every single image. `adoptRemoteDocument` re-hydrates *all* referenced
   * images and re-renders, so doing it per image is the difference between one
   * rebuild and a dozen for a workflow with a dozen pictures.
   */
  function scheduleReAdopt() {
    if (adoptPending) return;
    adoptPending = true;
    adoptTimer = schedule(() => {
      adoptPending = false;
      adoptTimer = 0;
      void reAdoptCurrent();
    }, reAdoptDelay);
  }

  function reportProgress() {
    if (!onProgress) return;
    if (incoming.size === 0) {
      imagesDone = 0;
      onProgress(null);
      return;
    }
    let chunks = 0;
    let chunksTotal = 0;
    for (const { received, total } of incoming.values()) {
      chunks += received;
      chunksTotal += total;
    }
    onProgress({
      done: imagesDone,
      total: imagesDone + incoming.size,
      chunks,
      chunksTotal,
    });
  }

  function noteChunk(id, total) {
    const entry = incoming.get(id) ?? { received: 0, total: 0 };
    entry.received += 1;
    entry.total = total ?? entry.total;
    incoming.set(id, entry);
    reportProgress();
  }

  /** A whole image landed: store it, show it, close its books. */
  async function absorbImage(id, payload) {
    receiving.delete(id);
    incoming.delete(id);
    wanted.delete(id);
    imagesDone += 1;
    await db.putImages([[id, payload]]);
    scheduleReAdopt();
    reportProgress();
    // Swarm distribution: announce to all room peers that we now hold this image,
    // enabling third/fourth incoming peers to download from multiple sources concurrently.
    try {
      session.broadcast?.(MSG.BLOB_HAVE, { ids: [id] });
    } catch {
      // Best-effort announcement
    }
  }

  /** An id reserved by the first authorized frame until its chunks finish. */
  const receiving = new Map();

  /**
   * Resource writes are replies, never unsolicited pushes. A valid frame must
   * come from the authenticated connection we asked, and its id must still be
   * absent locally. Image ids are generated identifiers rather than hashes, so
   * an existing id cannot be compared safely and is rejected instead of being
   * overwritten (this also covers preview/original frames sharing one id).
   */
  async function mayAbsorbImage(id, fromPeerId) {
    if (!id || !fromPeerId) return false;
    if (session.isPeerKnown && !session.isPeerKnown(fromPeerId)) return false;
    if (wanted.get(id) !== fromPeerId) return false;

    const reservedBy = receiving.get(id);
    if (reservedBy) return reservedBy === fromPeerId;
    receiving.set(id, fromPeerId);

    const stateImages = store.getState().images ?? {};
    if (Object.prototype.hasOwnProperty.call(stateImages, id)) {
      receiving.delete(id);
      wanted.delete(id);
      return false;
    }
    const stored = await db.getImageBlobMap?.([id]);
    if (stored?.has?.(id)) {
      receiving.delete(id);
      wanted.delete(id);
      return false;
    }
    return true;
  }

  /**
   * The images a request is already out for: id -> the peer asked.
   *
   * Every peer pushes its document at a newcomer at the same moment, and each
   * arrival would otherwise re-ask for the same missing images — one fetch
   * per image, no matter how many documents describe it.
   */
  const wanted = new Map();
  /** id -> peers that announced holding it (BLOB_HAVE). */
  const holders = new Map();
  /** What the room's document references; HAVE offers are matched against it. */
  let referenced = new Set(referencedImageIds(store.getState().nodes));
  /** Ids queued since the last flush; see WANT_DELAY_MS. */
  const pendingWant = new Set();
  let wantTimer = 0;
  let wantPending = false;

  function noteHave(ids, fromPeerId) {
    for (const id of ids ?? []) {
      if (!id) continue;
      let set = holders.get(id);
      if (!set) holders.set(id, (set = new Set()));
      set.add(fromPeerId);
    }
  }

  /** The known holder with the lightest in-flight load; else the fallback. */
  function pickHolder(id, fallback) {
    const known = holders.get(id);
    if (!known?.size) return fallback;
    let best = null;
    let bestLoad = Infinity;
    for (const peerId of known) {
      let load = 0;
      for (const holder of wanted.values()) if (holder === peerId) load += 1;
      if (load < bestLoad) {
        best = peerId;
        bestLoad = load;
      }
    }
    return best ?? fallback;
  }

  function flushWants(fallbackPeer) {
    wantPending = false;
    const held = new Set(Object.keys(store.getState().images ?? {}));
    const batches = new Map();
    for (const id of pendingWant) {
      if (held.has(id) || wanted.has(id)) continue;
      const holder = pickHolder(id, fallbackPeer);
      wanted.set(id, holder);
      let batch = batches.get(holder);
      if (!batch) batches.set(holder, (batch = []));
      batch.push(id);
    }
    pendingWant.clear();
    for (const [peerId, ids] of batches) {
      session.sendTo(peerId, MSG.BLOB_WANT, { ids });
    }
  }

  /**
   * Queues image requests. The flush is delayed so every peer's HAVE can
   * land first; the dedup is immediate, so a burst of documents still costs
   * one fetch per image.
   */
  function queueWants(ids, fallbackPeer) {
    const held = new Set(Object.keys(store.getState().images ?? {}));
    for (const id of ids) {
      if (id && !held.has(id) && !wanted.has(id)) pendingWant.add(id);
    }
    if (!pendingWant.size || wantPending) return;
    wantPending = true;
    wantTimer = schedule(() => flushWants(fallbackPeer), wantDelay);
  }

  /** Asks for whatever this document references and this peer lacks. */
  function requestMissing(fromPeerId, nodes) {
    const state = store.getState();
    referenced = new Set(referencedImageIds(nodes ?? state.nodes));
    queueWants([...referenced], fromPeerId);
  }

  session.setHandlers({
    /** A peer just arrived and has nothing; hand it the document. */
    onDocRequest(fromPeerId) {
      if (session.isPeerKnown && !session.isPeerKnown(fromPeerId)) return;
      // Holdings first: the channel is ordered, so the newcomer knows everyone
      // it can spread its requests across before its WANTs are computed.
      const held = Object.keys(store.getState().images ?? {});
      if (held.length) session.sendTo(fromPeerId, MSG.BLOB_HAVE, { ids: held });
      pushDocument(fromPeerId);
    },

    async onDocument(message, fromPeerId) {
      const state = store.getState();
      // In a view-only room the host is the sole editor: a document arriving
      // from a guest is either a stale echo or a bypass attempt, and adopting
      // it would let a viewer push changes. Ignore it. (Read-only guests are
      // told enough by the host's own push; this is the host-side defense.)
      const sessionState = session.getSnapshot?.() ?? {};
      if (sessionState.access === "view" && !sessionState.readOnly) return;
      const incomingRev = Number(message.rev ?? 0);
      const localRev = Number(state.rev ?? 0);
      // Revisions are local persistence counters, not a global ordering clock.
      // A peer can legitimately have a lower rev while carrying a concurrent
      // edit; syncBase and the three-way merge decide whether it is stale.
      // Outside a collaboration base, retain the ordinary stale-document
      // guard used by the persistence path.
      if (incomingRev < localRev && !state.syncBase) return;
      // The room's document is this page's own workflow, or the workflow the
      // room's members have announced. A guest arrives on a room link with a
      // fresh starter document of their own — the host's id, announced in its
      // HELLO, is the id the room is about.
      const roomWorkflowIds = new Set(
        [
          sessionState.workflowId,
          ...(sessionState.peers ?? []).map((peer) => peer.workflowId),
        ].filter(Boolean),
      );
      const joining =
        message.workflowId !== state.workflowId &&
        roomWorkflowIds.has(message.workflowId);
      // A document for another workflow is not ours to merge into this one —
      // unless joining a room makes it *the* document. A page holding its own
      // real workflow (the desktop app with a project open) keeps the old
      // behaviour and ignores foreign documents.
      if (message.workflowId !== state.workflowId && !joining) return;
      if (joining) {
        // The shared document replaces the guest's canvas wholesale — identity
        // included, so every later push is made under the room's id. The
        // guest's starter is boilerplate, not edits worth protecting: align
        // the sync base so adoption takes the room's document instead of
        // merging it into the starter.
        setCurrentWorkflowId(message.workflowId);
        session.setWorkflowId(message.workflowId);
        const starterSnapshot = snapshotDocument(store.getState);
        store.setState({
          workflowId: message.workflowId,
          syncBase: starterSnapshot,
          collabBase: starterSnapshot,
        });
      }
      applyingRemote = true;
      const localWireBeforeAdopt = JSON.stringify(currentDocument());
      let hasDiverged = false;
      try {
        hasDiverged = await state.adoptRemoteDocument(
          {
            id: message.workflowId,
            rev: Math.max(localRev, incomingRev),
            ...message.document,
          },
          undefined,
          { source: "collaboration" },
        );
      } finally {
        applyingRemote = false;
      }
      const mergedWire = JSON.stringify(currentDocument());
      const remoteWire = JSON.stringify(message.document ?? {});
      if (
        hasDiverged &&
        mergedWire !== remoteWire &&
        mergedWire !== localWireBeforeAdopt
      ) {
        // Keep the received wire as the echo marker so the merged local state
        // is allowed one outbound propagation.
        lastSeen = remoteWire;
        schedulePush();
      } else {
        lastSeen = mergedWire;
      }
      await requestMissing(fromPeerId, message.document?.nodes);
    },

    onBlobHave(ids, fromPeerId) {
      noteHave(ids, fromPeerId);
      // Only what the document references is worth asking for — a peer's
      // holdings are its whole library, most of which is none of our room.
      const interesting = (ids ?? []).filter((id) => referenced.has(id));
      queueWants(interesting, fromPeerId);
    },

    onBlobWant(ids, fromPeerId) {
      if (session.isPeerKnown && !session.isPeerKnown(fromPeerId)) return;
      void sendImages(fromPeerId, ids);
    },

    onBlobWantOriginal(ids, fromPeerId) {
      if (session.isPeerKnown && !session.isPeerKnown(fromPeerId)) return;
      // A design editor opened a picture; the fast first paint sent a compressed
      // preview, so hand over the untouched original for editing.
      void sendImages(fromPeerId, ids, { original: true });
    },

    async onBlobData(message, fromPeerId) {
      if (!(await mayAbsorbImage(message.id, fromPeerId))) return;
      noteChunk(message.id, message.total);
      const whole = reassembler.add(fromPeerId, message.id, message);
      if (whole === null) return;
      await absorbImage(message.id, whole);
    },

    /** The binary twin of onBlobData; the bytes arrive already decoded. */
    async onBlobChunk(meta, bytes, fromPeerId) {
      if (!(await mayAbsorbImage(meta.id, fromPeerId))) return;
      noteChunk(meta.id, meta.total);
      const whole = byteReassembler.add(fromPeerId, meta.id, {
        seq: meta.seq,
        total: meta.total,
        chunk: bytes,
      });
      if (whole === null) return;
      await absorbImage(meta.id, new Blob([whole], { type: meta.mime ?? "" }));
    },

    onStroke(message) {
      // Replayed rather than shipped as pixels: same code both sides, same
      // result, and kilobytes instead of a whole mask.
      emitRemoteStroke(message);
    },

    /** A peer shared a saved pipeline template (plan P3-3): keep it locally. */
    onSubgraphTemplate(template) {
      store.getState().receiveSubgraphTemplate?.(template);
    },
  });

  function syncReadOnly() {
    const sessionSnap = session.getSnapshot?.() ?? {};
    const isReadOnly = Boolean(sessionSnap.readOnly);
    store.getState?.().setReadOnly?.(isReadOnly);
    if (typeof store.setState === "function") {
      store.setState({
        collabUserId: sessionSnap.selfId,
        collabReadOnly: isReadOnly,
        readOnly: isReadOnly,
      });
    } else if (store.state) {
      store.state.collabUserId = sessionSnap.selfId;
      store.state.collabReadOnly = isReadOnly;
      store.state.readOnly = isReadOnly;
    }
  }
  syncReadOnly();
  const unsubscribeSession = session.subscribe?.(() => syncReadOnly());

  const unsubscribe = store.subscribe(() => schedulePush());
  const unlisten = onLocalStroke((stroke) => {
    session.broadcast(MSG.STROKE, stroke);
  });

  return () => {
    unsubscribeSession?.();
    store.getState?.().setReadOnly?.(false);
    if (typeof store.setState === "function") {
      store.setState({
        collabSession: null,
        readOnly: false,
        collabReadOnly: false,
      });
    } else if (store.state) {
      store.state.collabSession = null;
      store.state.readOnly = false;
      store.state.collabReadOnly = false;
    }
    unsubscribe?.();
    unlisten?.();
    if (pushTimer) unschedule(pushTimer);
    if (wantTimer) unschedule(wantTimer);
    if (adoptTimer) unschedule(adoptTimer);
    pushTimer = 0;
    wantTimer = 0;
    adoptTimer = 0;
    // The bridge owns the session handlers and therefore its lifecycle. Stop
    // the heartbeat/transport here so a detached test or panel cannot keep the
    // Node event loop (or a browser worker) alive after all assertions finish.
    session.stop?.();
    session.setHandlers({});
  };
}
