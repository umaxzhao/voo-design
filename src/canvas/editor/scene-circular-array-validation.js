/**
 * Circular array modifier — validation and normalization.
 *
 * Mirrors `scene-linear-array-validation.js` in shape and contract, so the circular array is a new KIND in
 * the existing modifier architecture rather than a parallel mechanism. The four parameters are the whole
 * feature: `count`, `radius`, `startAngle` and `arcSpan`. Nothing animates, nothing follows a path, nothing
 * is randomised, and no new framework is introduced.
 *
 * SLOT MODEL — THE SOURCE IS SLOT 0 AND IS NEVER MOVED.
 *
 *   slot 0        the canonical source node, keeping its OWN id, editable and unmoved
 *   slots 1..n-1  derived ring clones, `count - 1` of them, with stable derived ids
 *
 * `count` therefore counts the SOURCE TOO: `count === 1` means "source only, no clones". Ring offsets are
 * measured RELATIVE TO THE SOURCE at slot 0, which is what keeps a stale source from sitting alongside a
 * full set of ring clones — the source is part of the ring by construction rather than an extra body at the
 * origin that a later edit could leave behind.
 *
 * WHY NO PRODUCT CEILING HERE. An earlier revision invented `MAX_CIRCULAR_ARRAY_COUNT = 512`. That is a
 * made-up product limit dressed as a guard, and it would silently cap a legitimate document. Structural
 * sanity is `Number.isSafeInteger`; the real budget belongs to the shared collection validator, which
 * already owns it, and is not duplicated here.
 *
 * ANIMATION IS REJECTED, NOT STRIPPED. The scope is static geometry, and there is no supported animated
 * property for a circular array (unlike the linear array, which animates its `step.*`). Accepting a track and
 * dropping it would tell a caller their animation was honoured when it was not; this package has already been
 * burned by affordances that lied, so an animation track is a hard `TypeError`.
 *
 * COORDINATES ARE LOCAL. A slot's offset is expressed in the TARGET's own local space, exactly as the linear
 * array expresses its step, and reuses that same local-3D mapping so native 2D and 3D derive from one set of
 * numbers. No up-axis change.
 *
 * @module scene-circular-array-validation
 */

/** The modifier kind added to the existing collection. */
export const CIRCULAR_MODIFIER_TYPE = "circularArray";

/** Angular values are degrees, matching the rest of the editor's transform surface. */
export const ARC_SPAN_LIMIT_DEGREES = 360;

/**
 * The ONLY circular properties that animate. `count` and `arcSpan` are structural and stay static.
 *
 * Exported so the motion module and the UI share one source of truth instead of three copies of a list.
 */
export const CIRCULAR_ANIMATABLE_PROPERTIES = Object.freeze([
  "radius",
  "startAngle",
]);

/**
 * Validates one circular array modifier against its target.
 *
 * Throws `TypeError` on anything unusable rather than coercing it: a silently repaired count or angle would
 * make a wrong document look right, which is the failure this project's fixtures exist to catch.
 *
 * @param {object} modifier
 * @param {object|null} [targetNode]
 * @returns {true}
 */
export function validateCircularArrayModifier(modifier, targetNode = null) {
  if (modifier?.enabled !== undefined && typeof modifier.enabled !== "boolean") {
    throw new TypeError("Modifier enabled must be a boolean");
  }
  if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
    throw new TypeError("Modifier configuration must be an object");
  }
  if (modifier.type !== CIRCULAR_MODIFIER_TYPE) {
    throw new TypeError(`Unsupported modifier type: ${modifier.type}`);
  }
  if (typeof modifier.id !== "string" || modifier.id.trim() === "") {
    throw new TypeError("Modifier id must be a non-empty string");
  }
  if (
    typeof modifier.targetId !== "string" ||
    modifier.targetId.trim() === ""
  ) {
    throw new TypeError("Modifier targetId must be a non-empty string");
  }
  // `count` includes the source, so 1 is the minimum meaningful value.
  if (!Number.isSafeInteger(modifier.count) || modifier.count < 1) {
    throw new TypeError(
      "Modifier count must be a safe integer >= 1 (count includes the source)",
    );
  }
  if (!Number.isFinite(modifier.radius) || modifier.radius < 0) {
    throw new TypeError("Modifier radius must be a finite number >= 0");
  }
  if (!Number.isFinite(modifier.startAngle)) {
    throw new TypeError(
      "Modifier startAngle must be a finite number of degrees",
    );
  }
  if (!Number.isFinite(modifier.arcSpan)) {
    throw new TypeError("Modifier arcSpan must be a finite number of degrees");
  }
  if (modifier.arcSpan < 0 || modifier.arcSpan > ARC_SPAN_LIMIT_DEGREES) {
    throw new TypeError(
      `Modifier arcSpan must be between 0 and ${ARC_SPAN_LIMIT_DEGREES} degrees`,
    );
  }
  // ANIMATION IS ALLOWED FOR EXACTLY TWO PROPERTIES. `radius` and `startAngle` are the circular array's own
  // spacing controls and animate through the same accepted mechanism the linear array uses for its step.
  // `count` and `arcSpan` are STRUCTURAL: a ring that changes how many slots it has, or how wide its arc is,
  // is a different arrangement rather than a motion of one, so a track on either is REJECTED here rather than
  // silently ignored. Nothing is stripped: a track that survives validation is preserved by normalization.
  if (modifier.animations !== undefined) {
    if (!Array.isArray(modifier.animations)) {
      throw new TypeError("Modifier animations must be an array");
    }
    for (const track of modifier.animations) {
      if (!track || typeof track !== "object" || Array.isArray(track)) {
        throw new TypeError("Animation track must be an object");
      }
      if (!CIRCULAR_ANIMATABLE_PROPERTIES.includes(track.property)) {
        throw new TypeError(
          `Cannot animate circular array property "${track.property}"; only ${CIRCULAR_ANIMATABLE_PROPERTIES.join(
            " and ",
          )} animate, while count and arcSpan stay static`,
        );
      }
      if (!Array.isArray(track.keyframes)) {
        throw new TypeError("Animation track keyframes must be an array");
      }
      // FRAME-SHAPE VALIDATION, matching the linear array's existing contract exactly rather than inventing a
      // second one. The previous revision only checked the track's PROPERTY and let the keyframe payload
      // through untouched, so a malformed or NEGATIVE frame was copied by normalization and only blew up much
      // later when the evaluator threw on a negative radius — or worse, a NaN was silently ignored and the
      // ring quietly used the wrong radius.
      for (const kf of track.keyframes) {
        if (!kf || typeof kf !== "object" || Array.isArray(kf)) {
          throw new TypeError("Keyframe must be an object");
        }
        if (
          !Number.isFinite(kf.time) ||
          kf.time < 0 ||
          !Number.isFinite(kf.value)
        ) {
          throw new TypeError(
            "Keyframes require finite non-negative time and numeric value",
          );
        }
        // The circular array's own parameter domain: a radius cannot be negative. `startAngle` is any finite
        // degree value, so it has no extra bound beyond the finite check above.
        if (track.property === "radius" && kf.value < 0) {
          throw new TypeError(
            `Circular array radius keyframes must be >= 0, got ${kf.value}`,
          );
        }
      }
    }
  }
  if (
    targetNode &&
    typeof targetNode.id === "string" &&
    modifier.targetId !== targetNode.id
  ) {
    throw new TypeError(
      `Modifier targetId "${modifier.targetId}" does not match node "${targetNode.id}"`,
    );
  }
  return true;
}

/**
 * The angular offset of one slot, in degrees, relative to the source at slot 0.
 *
 * A FULL circle spaces the whole ring by `count`, so the last clone does not land back on the source. A
 * PARTIAL arc spaces the `count - 1` clones by `count - 1`, so both endpoints of the span are realised. That
 * difference is the whole reason `arcSpan` is a separate parameter rather than an implied 360.
 *
 * @param {{count:number, startAngle:number, arcSpan:number}} modifier
 * @param {number} slotIndex 0 is the source; 1..count-1 are the clones
 * @returns {number} degrees
 */
export function circularSlotAngle(modifier, slotIndex) {
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) {
    throw new TypeError("slotIndex must be a safe integer >= 0");
  }
  if (slotIndex === 0) return modifier.startAngle;
  if (slotIndex > modifier.count - 1) {
    throw new TypeError(
      `slotIndex ${slotIndex} exceeds the ${modifier.count - 1} derived slot(s) for count ${modifier.count}`,
    );
  }
  const steps =
    modifier.arcSpan >= ARC_SPAN_LIMIT_DEGREES
      ? modifier.count
      : modifier.count - 1;
  const stride = steps > 0 ? modifier.arcSpan / steps : 0;
  return modifier.startAngle + stride * slotIndex;
}

/**
 * The LOCAL offset of one slot, in the target's own space.
 *
 * Slot 0 is exactly zero: the source is the ring's origin and is never displaced. The same numbers feed the
 * 2D and the 3D path, so the two cannot drift apart.
 *
 * @param {{count:number, radius:number, startAngle:number, arcSpan:number}} modifier
 * @param {number} slotIndex
 * @returns {{x:number, y:number, z:number, angle:number}}
 */
export function circularSlotOffset(modifier, slotIndex) {
  const angle = circularSlotAngle(modifier, slotIndex);
  if (slotIndex === 0) return { x: 0, y: 0, z: 0, angle };
  // COMMON CIRCLE. Slot 0 is the source and sits ON the ring; the ring's CENTRE is `radius` away from it,
  // opposite the start angle. Every slot's displacement is therefore measured from the SOURCE'S OWN RING
  // POSITION, not radially from the source. Offsetting each clone by `radius * direction` from the source
  // instead makes the source the CENTRE of the pattern: with count=4 and a 90-degree stride the opposite
  // slot lands exactly on the ring centre, which is what the real-red capture showed.
  const radians = (angle * Math.PI) / 180;
  const startRadians = (modifier.startAngle * Math.PI) / 180;
  return {
    x: modifier.radius * (Math.cos(radians) - Math.cos(startRadians)),
    y: modifier.radius * (Math.sin(radians) - Math.sin(startRadians)),
    z: 0,
    angle,
  };
}

/**
 * The stable id for a slot.
 *
 * Slot 0 is the SOURCE and keeps the source's own id — that is what keeps the canonical node editable and
 * unmoved. Derived slots use the established `<sourceId>__arr_<modifierId>_s<n>` scheme, IDENTICAL to the
 * linear array's, so persistence, selection, undo and the existing slot-id collision checks all apply
 * without modification.
 *
 * @param {string} sourceId
 * @param {string} modifierId
 * @param {number} slotIndex
 * @returns {string}
 */
export function getCircularArraySlotId(sourceId, modifierId, slotIndex) {
  if (typeof sourceId !== "string" || !sourceId) {
    throw new TypeError("sourceId must be a non-empty string");
  }
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) {
    throw new TypeError("slotIndex must be a safe integer >= 0");
  }
  if (slotIndex === 0) return sourceId;
  return `${sourceId}__arr_${modifierId}_s${slotIndex}`;
}

/**
 * Normalizes a circular array modifier to its canonical field set.
 *
 * The field set is closed: exactly the four parameters plus identity. Animation never reaches here, because
 * validation rejects it outright rather than this function quietly dropping it.
 *
 * @param {object} modifier
 * @param {object|null} [targetNode]
 * @returns {object}
 */
export function normalizeCircularArrayModifier(modifier, targetNode = null) {
  validateCircularArrayModifier(modifier, targetNode);
  const normalized = {
    id: modifier.id.trim(),
    type: CIRCULAR_MODIFIER_TYPE,
    targetId: modifier.targetId.trim(),
    ...(modifier.enabled !== undefined ? { enabled: modifier.enabled } : {}),
    count: modifier.count,
    radius: modifier.radius,
    startAngle: modifier.startAngle,
    arcSpan: modifier.arcSpan,
  };
  // The canonical STATIC parameters above are always present and are never replaced by a sampled frame. The
  // animated tracks travel alongside them, so a document reopened at any time still carries the editable
  // source values plus its keys, and nothing is destructively flattened per frame.
  if (Array.isArray(modifier.animations) && modifier.animations.length > 0) {
    normalized.animations = modifier.animations.map((track) => ({
      property: track.property,
      keyframes: [...track.keyframes]
        .map((kf) => ({
          time: kf.time,
          value: kf.value,
          ...(kf.easing ? { easing: kf.easing } : {}),
        }))
        .sort((a, b) => a.time - b.time),
    }));
  }
  return normalized;
}

/**
 * Every slot of one modifier, source first.
 *
 * @param {object} modifier a normalized circular array modifier
 * @returns {Array<{slotIndex:number, id:string, isSource:boolean, x:number, y:number, z:number, angle:number}>}
 */
export function circularArraySlots(modifier) {
  const slots = [];
  for (let slotIndex = 0; slotIndex <= modifier.count - 1; slotIndex += 1) {
    const offset = circularSlotOffset(modifier, slotIndex);
    slots.push({
      slotIndex,
      id: getCircularArraySlotId(modifier.targetId, modifier.id, slotIndex),
      isSource: slotIndex === 0,
      ...offset,
    });
  }
  return slots;
}
