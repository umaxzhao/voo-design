/**
 * Splitting large payloads across a data channel, and putting them back.
 *
 * A workflow document is kilobytes and travels whole; an image is megabytes
 * and cannot. Browsers cap a single reliable data-channel message well below
 * that — the safe figure across implementations is around 256KB — and a send
 * over the cap does not truncate, it tears the channel down. So anything that
 * could be big is cut here first.
 *
 * Two shapes exist:
 *
 *  - String chunks (`splitPayload`/`createReassembler`) carry a payload that
 *    is already text, like a data URL, inside ordinary JSON messages.
 *  - Binary frames (`encodeBinaryFrame`/`decodeBinaryFrame` plus
 *    `createByteReassembler`) carry raw bytes: a 4-byte header length, a small
 *    JSON header with the same `t`/`v` vocabulary as every other message,
 *    then the payload. Skipping base64 saves a third of the wire and both
 *    ends' encode/decode work.
 *
 * Reassembly is per sender and per payload, because two peers can be pushing
 * different images at the same moment and their chunks interleave on the wire.
 */

import { ProtocolError, PROTOCOL_VERSION, MSG } from "./protocol.js";

/** Payload bytes per chunk, comfortably under every implementation's cap. */
export const CHUNK_SIZE = 48 * 1024;

/** Raw bytes per binary frame; no base64, so a little more than CHUNK_SIZE. */
export const BINARY_CHUNK_SIZE = 64 * 1024;

/**
 * Upper bound on the number of chunks a single payload may claim.
 *
 * A peer is not trusted. `total` tells the reassembler how many chunks to wait
 * for, and with no cap a peer could claim `total: 1e9` and hold an entry in
 * `pending` forever (a slow, unbounded resource soak) while also driving the
 * completion loop to 1e9 iterations the moment its parts count reached the
 * claim. `CHUNK_SIZE` (48KB) / `BINARY_CHUNK_SIZE` (64KB) bound how many chunks
 * a real payload needs: the transport's high-water buffer is 8MB
 * (webrtc_transport.js BUFFER_HIGH_WATER), so a single multi-MB image is
 * comfortably under ~171 string / ~128 binary chunks. `MAX_TOTAL_CHUNKS` is a
 * generous ceiling a few hundred times that, so it never rejects a real image
 * yet caps the per-payload reassembly state (and the completion loop) at 4096
 * instead of unbounded.
 */
export const MAX_TOTAL_CHUNKS = 4096;

/**
 * Whether a chunk's index is within a sane range for the payload it names.
 *
 * Shared by both reassemblers and the binary-frame decoder so they all reject
 * an out-of-contract `seq`/`total` the same way: `seq` must be a non-negative
 * integer strictly less than `total`, `total` a positive integer no larger
 * than a single payload could plausibly need, and both finite.
 */
function validChunkIndex(seq, total) {
  return (
    Number.isInteger(seq) &&
    Number.isInteger(total) &&
    seq >= 0 &&
    seq < total &&
    total <= MAX_TOTAL_CHUNKS
  );
}

/**
 * Cuts a string into numbered pieces.
 *
 * @param {string} text the payload, already encoded (a data URL, say).
 * @returns {Array<{seq: number, total: number, chunk: string}>} always at
 *   least one piece, so a caller never has to special-case an empty payload.
 */
export function splitPayload(text, size = CHUNK_SIZE) {
  const source = String(text ?? "");
  const total = Math.max(1, Math.ceil(source.length / size));
  const pieces = [];
  for (let seq = 0; seq < total; seq += 1) {
    pieces.push({
      seq,
      total,
      chunk: source.slice(seq * size, (seq + 1) * size),
    });
  }
  return pieces;
}

/**
 * Collects chunks until a payload is whole.
 *
 * Deliberately tolerant of duplicates and of out-of-order arrival: the channel
 * is ordered today, but a payload that only reassembles under that assumption
 * would break silently the day an unordered one is used for latency.
 */
export function createReassembler() {
  /** `${from}|${id}` -> { total, parts: Map<seq, chunk> } */
  const pending = new Map();

  return {
    /**
     * Adds a chunk.
     *
     * @returns {string|null} the finished payload, or null while it is still
     *   incomplete — so a caller can act on the return value alone.
     */
    add(from, id, { seq, total, chunk }) {
      if (!validChunkIndex(seq, total)) return null;
      const key = `${from}|${id}`;
      let entry = pending.get(key);
      if (!entry || entry.total !== total) {
        entry = { total, parts: new Map() };
        pending.set(key, entry);
      }
      entry.parts.set(seq, String(chunk ?? ""));
      if (entry.parts.size < total) return null;

      pending.delete(key);
      let out = "";
      for (let i = 0; i < total; i += 1) out += entry.parts.get(i) ?? "";
      return out;
    },

    /** Drops everything a peer had in flight; called when it disconnects. */
    forget(from) {
      const prefix = `${from}|`;
      for (const key of [...pending.keys()]) {
        if (key.startsWith(prefix)) pending.delete(key);
      }
    },

    /** How many payloads are part-way in, for tests and diagnostics. */
    get size() {
      return pending.size;
    },
  };
}

/**
 * Packs one binary chunk into a self-describing frame:
 * `[4-byte big-endian header length][header JSON][payload bytes]`.
 *
 * Self-describing rather than "the next N messages belong to the last header"
 * because two images may interleave on one channel — each frame has to stand
 * alone the way every JSON message here does.
 *
 * @param {object} meta `{t, v, id, seq, total, ...}` — same vocabulary as MSG.
 * @param {Uint8Array} bytes
 * @returns {ArrayBuffer}
 */
export function encodeBinaryFrame(meta, bytes) {
  const head = new TextEncoder().encode(JSON.stringify(meta));
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength);
  const frame = new Uint8Array(4 + head.byteLength + view.byteLength);
  new DataView(frame.buffer).setUint32(0, head.byteLength);
  frame.set(head, 4);
  frame.set(view, 4 + head.byteLength);
  return frame.buffer;
}

/**
 * Unpacks a binary frame. The mirror of `encodeBinaryFrame`.
 *
 * @returns {{meta: object, bytes: Uint8Array}}
 * @throws {ProtocolError} on anything that is not a well-formed current frame.
 */
export function decodeBinaryFrame(raw) {
  const bytes =
    raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : raw instanceof Uint8Array
        ? raw
        : null;
  if (!bytes || bytes.byteLength < 4) throw new ProtocolError("notBinaryFrame");
  const headLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(
    0,
  );
  if (headLength < 2 || 4 + headLength > bytes.byteLength) {
    throw new ProtocolError("notBinaryFrame");
  }
  let meta;
  try {
    meta = JSON.parse(
      new TextDecoder().decode(bytes.subarray(4, 4 + headLength)),
    );
  } catch {
    throw new ProtocolError("notJson");
  }
  if (!meta || typeof meta !== "object") throw new ProtocolError("notObject");
  if (meta.v !== PROTOCOL_VERSION) {
    throw new ProtocolError("versionMismatch", `saw ${meta.v}`);
  }
  if (meta.t !== MSG.BLOB_DATA) {
    // A binary frame only ever carries a blob chunk (encodeBinaryFrame is only
    // called with MSG.BLOB_DATA); anything else is not this channel's contract.
    throw new ProtocolError("unknownType", String(meta.t));
  }
  if (typeof meta.id !== "string") {
    throw new ProtocolError("missingField", `${meta.t}.id`);
  }
  if (!validChunkIndex(meta.seq, meta.total)) {
    throw new ProtocolError("missingField", `${meta.t}.seq/total`);
  }
  return { meta, bytes: bytes.subarray(4 + headLength) };
}

/**
 * Collects binary chunks until a payload is whole — `createReassembler`'s
 * twin for bytes, with the same tolerance for duplicates and reordering.
 */
export function createByteReassembler() {
  /** `${from}|${id}` -> { total, parts: Map<seq, Uint8Array> } */
  const pending = new Map();

  return {
    /**
     * Adds a chunk.
     *
     * @returns {Uint8Array|null} the finished payload, or null while it is
     *   still incomplete — so a caller can act on the return value alone.
     */
    add(from, id, { seq, total, chunk }) {
      if (!validChunkIndex(seq, total)) return null;
      const key = `${from}|${id}`;
      let entry = pending.get(key);
      if (!entry || entry.total !== total) {
        entry = { total, parts: new Map() };
        pending.set(key, entry);
      }
      entry.parts.set(
        seq,
        chunk instanceof Uint8Array ? chunk : new Uint8Array(0),
      );
      if (entry.parts.size < total) return null;

      pending.delete(key);
      let length = 0;
      for (const part of entry.parts.values()) length += part.byteLength;
      const out = new Uint8Array(length);
      let offset = 0;
      for (let i = 0; i < total; i += 1) {
        const part = entry.parts.get(i);
        if (!part) continue;
        out.set(part, offset);
        offset += part.byteLength;
      }
      return out;
    },

    /** Drops everything a peer had in flight; called when it disconnects. */
    forget(from) {
      const prefix = `${from}|`;
      for (const key of [...pending.keys()]) {
        if (key.startsWith(prefix)) pending.delete(key);
      }
    },

    /** How many payloads are part-way in, for tests and diagnostics. */
    get size() {
      return pending.size;
    },
  };
}
