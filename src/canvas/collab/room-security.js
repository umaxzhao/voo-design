import { MSG } from "./protocol.js";

export function isProtectedWire(wire) {
  try {
    const type = typeof wire === "string" ? JSON.parse(wire).t : null;
    return [MSG.DOC, MSG.DOC_REQUEST, MSG.BLOB_HAVE, MSG.BLOB_WANT,
      MSG.BLOB_WANT_ORIGINAL, MSG.BLOB_DATA, MSG.STROKE].includes(type);
  } catch {
    return false;
  }
}

export async function proofFor(roomSecret, peerId) {
  if (!roomSecret) return undefined;
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(roomSecret), "HKDF", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode("voo-room-proof-v1") },
    keyMaterial, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(peerId));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyHello(roomSecret, message) {
  if (!roomSecret) return true;
  if (typeof message.proof !== "string") return false;
  const expected = await proofFor(roomSecret, message.peerId);
  if (message.proof.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ message.proof.charCodeAt(index);
  }
  return difference === 0;
}
