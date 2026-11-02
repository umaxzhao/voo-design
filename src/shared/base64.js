/**
 * Base64 helpers for the browser and the Electron renderer, which have no
 * `Buffer` global. Both directions walk the bytes through a lookup table into
 * one output buffer. Building a binary string for `btoa`/`atob` is several times
 * slower on the image sizes a Figma file or a saved document carries.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PAD_CODE = "=".charCodeAt(0);
const ALPHABET_CODES = Uint8Array.from(ALPHABET, (char) => char.charCodeAt(0));
const DECODE_TABLE = new Uint8Array(256).fill(0xff);
for (let index = 0; index < ALPHABET.length; index += 1) {
  DECODE_TABLE[ALPHABET.charCodeAt(index)] = index;
}
const textDecoder = new TextDecoder();

export function bytesToBase64(bytes) {
  const fullGroups = Math.floor(bytes.length / 3);
  const remainder = bytes.length % 3;
  const out = new Uint8Array((fullGroups + (remainder ? 1 : 0)) * 4);
  let input = 0;
  let output = 0;
  for (let group = 0; group < fullGroups; group += 1) {
    const value = (bytes[input] << 16) | (bytes[input + 1] << 8) | bytes[input + 2];
    out[output] = ALPHABET_CODES[value >> 18];
    out[output + 1] = ALPHABET_CODES[(value >> 12) & 63];
    out[output + 2] = ALPHABET_CODES[(value >> 6) & 63];
    out[output + 3] = ALPHABET_CODES[value & 63];
    input += 3;
    output += 4;
  }
  if (remainder === 1) {
    const value = bytes[input] << 16;
    out[output] = ALPHABET_CODES[value >> 18];
    out[output + 1] = ALPHABET_CODES[(value >> 12) & 63];
    out[output + 2] = PAD_CODE;
    out[output + 3] = PAD_CODE;
  } else if (remainder === 2) {
    const value = (bytes[input] << 16) | (bytes[input + 1] << 8);
    out[output] = ALPHABET_CODES[value >> 18];
    out[output + 1] = ALPHABET_CODES[(value >> 12) & 63];
    out[output + 2] = ALPHABET_CODES[(value >> 6) & 63];
    out[output + 3] = PAD_CODE;
  }
  return textDecoder.decode(out);
}

/** Decodes standard base64 text (with or without padding) into bytes. */
export function base64ToBytes(base64) {
  const codes = new TextEncoder().encode(base64);
  let end = codes.length;
  while (end > 0 && codes[end - 1] === PAD_CODE) end -= 1;
  if (end % 4 === 1) throw new Error("invalid base64 length");
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let output = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < end; index += 1) {
    const value = DECODE_TABLE[codes[index]];
    if (value === 0xff) throw new Error("invalid base64 character");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[output] = (buffer >> bits) & 0xff;
      output += 1;
    }
  }
  return out;
}
