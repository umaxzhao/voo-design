/**
 * Shared document snapshot schema and undo granularity invariants for the
 * Design editor.
 *
 * Prevents:
 * 1. Missing document state in snapshots (field omissions causing state loss
 *    or orphan-cleaner deletion on undo).
 * 2. Intermediate progress commits (pointer dragging, slider moving, typing)
 *    polluting the history stack.
 * 3. Contract bypasses (direct history mutations outside registered boundaries).
 */

export const EDITOR_DOCUMENT_INVARIANTS = Object.freeze({
  /** 一次用户动作恰好产生一条历史 */
  ATOMIC_ACTION_SINGLE_COMMIT: Object.freeze({
    id: "INV_ATOMIC_ACTION_SINGLE_COMMIT",
    name: "Atomic user action produces exactly one history entry",
    expectedDelta: 1,
  }),
  /** 过程态（拖拽中、输入中）零条 */
  INTERMEDIATE_ZERO_COMMIT: Object.freeze({
    id: "INV_INTERMEDIATE_ZERO_COMMIT",
    name: "In-flight / intermediate gestures produce zero history entries",
    expectedDelta: 0,
  }),
  /** 最终落地一条 */
  GESTURE_FINAL_COMMIT: Object.freeze({
    id: "INV_GESTURE_FINAL_COMMIT",
    name: "Completed changed gesture produces exactly one history entry",
    expectedDelta: 1,
  }),
});

/**
 * Mandatory fields required in full document snapshots.
 * Omission of any field here represents a state regression bug class.
 */
export const REQUIRED_SNAPSHOT_FIELDS = Object.freeze({
  design: Object.freeze(["doc", "pixelSelection"]),
  designDoc: Object.freeze([
    "version",
    "width",
    "height",
    "backgroundColor",
    "nodes",
  ]),
});

export class EditorSnapshotContractError extends Error {
  constructor(message, { domain, missingFields = [], errors = [] } = {}) {
    super(message);
    this.name = "EditorSnapshotContractError";
    this.domain = domain;
    this.missingFields = missingFields;
    this.errors = errors;
  }
}

/**
 * Validates a document snapshot against the required contract schema for its domain.
 *
 * @param {"design"} domain
 * @param {unknown} snapshot
 * @param {{ throwIfInvalid?: boolean }} [options]
 * @returns {{ valid: boolean, domain: string, missingFields: string[], errors: string[] }}
 */
export function validateEditorDocumentSnapshot(
  domain,
  snapshot,
  { throwIfInvalid = true } = {},
) {
  const missingFields = [];
  const errors = [];

  if (domain === "design") {
    let parsed = snapshot;
    if (typeof snapshot === "string") {
      try {
        parsed = JSON.parse(snapshot);
      } catch (e) {
        const err = `[EditorSnapshotContractError:design] Snapshot string is not valid JSON: ${e.message}`;
        if (throwIfInvalid) {
          throw new EditorSnapshotContractError(err, {
            domain,
            missingFields: ["doc", "pixelSelection"],
            errors: [err],
          });
        }
        return {
          valid: false,
          domain,
          missingFields: ["doc", "pixelSelection"],
          errors: [err],
        };
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = `[EditorSnapshotContractError:design] Snapshot must be an object or JSON string, got ${typeof parsed}`;
      if (throwIfInvalid) {
        throw new EditorSnapshotContractError(err, {
          domain,
          missingFields: [...REQUIRED_SNAPSHOT_FIELDS.design],
          errors: [err],
        });
      }
      return {
        valid: false,
        domain,
        missingFields: [...REQUIRED_SNAPSHOT_FIELDS.design],
        errors: [err],
      };
    }

    for (const field of REQUIRED_SNAPSHOT_FIELDS.design) {
      if (!(field in parsed)) {
        missingFields.push(field);
      }
    }

    if (
      parsed.doc &&
      typeof parsed.doc === "object" &&
      !Array.isArray(parsed.doc)
    ) {
      for (const docField of REQUIRED_SNAPSHOT_FIELDS.designDoc) {
        if (!(docField in parsed.doc)) {
          missingFields.push(`doc.${docField}`);
        }
      }
      if ("nodes" in parsed.doc && !Array.isArray(parsed.doc.nodes)) {
        errors.push("doc.nodes must be an Array");
      }
    }
  } else {
    throw new TypeError(
      `[EditorSnapshotContractError] Unknown domain "${domain}". Expected "design".`,
    );
  }

  const valid = missingFields.length === 0 && errors.length === 0;
  if (!valid && throwIfInvalid) {
    const details = [
      missingFields.length > 0
        ? `missing required fields: [${missingFields.join(", ")}]`
        : null,
      errors.length > 0 ? `errors: [${errors.join("; ")}]` : null,
    ]
      .filter(Boolean)
      .join("; ");

    throw new EditorSnapshotContractError(
      `[EditorSnapshotContractError:${domain}] Snapshot violates document contract: ${details}`,
      { domain, missingFields, errors },
    );
  }

  return { valid, domain, missingFields, errors };
}

/**
 * Validates undo/redo stack depth changes against contract invariants.
 *
 * @param {{
 *   initialDepth: number,
 *   inFlightDepth: number,
 *   finalDepth: number,
 *   changed: boolean,
 *   cancelled?: boolean,
 * }} options
 */
export function verifyEditorHistoryInvariants({
  initialDepth,
  inFlightDepth,
  finalDepth,
  changed,
  cancelled = false,
}) {
  // Invariant 2: 过程态（拖拽中、输入中）零条
  if (inFlightDepth !== initialDepth) {
    throw new Error(
      `[InvariantViolation:INV_INTERMEDIATE_ZERO_COMMIT] In-flight gesture modified history depth. Expected ${initialDepth}, got ${inFlightDepth}`,
    );
  }

  // Invariant 3: 最终落地一条 (if changed and not cancelled)
  if (cancelled || !changed) {
    if (finalDepth !== initialDepth) {
      throw new Error(
        `[InvariantViolation:INV_GESTURE_FINAL_COMMIT] Cancelled/unchanged gesture modified history depth. Expected ${initialDepth}, got ${finalDepth}`,
      );
    }
  } else {
    if (finalDepth !== initialDepth + 1) {
      throw new Error(
        `[InvariantViolation:INV_GESTURE_FINAL_COMMIT] Changed gesture did not commit exactly one history entry. Expected ${initialDepth + 1}, got ${finalDepth}`,
      );
    }
  }

  return true;
}
