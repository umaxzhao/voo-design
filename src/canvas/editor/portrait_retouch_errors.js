/**
 * Error codes and error class for on-device portrait retouch engine.
 */

export const RETOUCH_ERRORS = Object.freeze({
  INVALID_BUFFER: "ERR_RETOUCH_INVALID_BUFFER",
  INVALID_DIMENSIONS: "ERR_RETOUCH_INVALID_DIMENSIONS",
  DIMENSION_MISMATCH: "ERR_RETOUCH_DIMENSION_MISMATCH",
  MASK_MISMATCH: "ERR_RETOUCH_MASK_MISMATCH",
  INVALID_PARAMETER: "ERR_RETOUCH_INVALID_PARAMETER",
});

export class PortraitRetouchError extends Error {
  /**
   * @param {string} code - Machine-readable error code from RETOUCH_ERRORS
   * @param {string} [message] - Context detail for debugging (not user-facing)
   */
  constructor(code, message) {
    super(message || code);
    this.name = "PortraitRetouchError";
    this.code = code;
  }
}
