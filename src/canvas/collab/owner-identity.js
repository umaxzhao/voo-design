const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
const payload = (room, connection, peer, access, challenge) => new TextEncoder().encode(JSON.stringify(["voo-owner-v1", room, connection, peer, access, challenge]));

/** The private signing key never leaves the hosting session. */
export async function createOwnerIdentity() {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const publicKey = encode(new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey)));
  return {
    publicKey,
    async sign(room, connection, peer, access, challenge) {
      return encode(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, payload(room, connection, peer, access, challenge))));
    },
  };
}

export async function verifyOwnerIdentity(publicKey, signature, room, connection, peer, access, challenge) {
  if (typeof publicKey !== "string" || typeof signature !== "string" || typeof challenge !== "string" || !["view", "edit"].includes(access)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", decode(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(signature), payload(room, connection, peer, access, challenge));
  } catch { return false; }
}
