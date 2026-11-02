/**
 * Puppet Warp Pin manipulation API.
 *
 * Implements pin selection, rotation, depth ordering, fixation, and deletion
 * on the active image node's Puppet Warp mesh.
 */

import { findNode } from "./scene_model.js";
import * as ops from "./doc_ops.js";
import { applyPuppetPins } from "./puppet_warp.js";
import {
  degToRad,
  movePinDepth,
  normalizeDeg,
  radToDeg,
  rotatePuppetPin,
} from "./puppet_pin_ops.js";

export function createPuppetTransformApi({
  getDoc,
  setDoc,
  getSelectedId,
  getSelectedPuppetPin,
  setSelectedPuppetPin,
  commitTransformChange,
  notify,
}) {
  return {
    /** The Puppet Warp pin selected in the editor (blue), or null. */
    getSelectedPuppetPin: () => getSelectedPuppetPin(),

    setSelectedPuppetPin(id) {
      setSelectedPuppetPin(id ?? null);
      notify();
    },

    /** Removes the selected Puppet Warp pin (Delete/Backspace). */
    deletePuppetPin() {
      const active = getSelectedId()
        ? findNode(getDoc(), getSelectedId())
        : null;
      const selectedPuppetPinId = getSelectedPuppetPin();
      if (!active || !selectedPuppetPinId) return false;
      const next = ops.updateNode(getDoc(), active.id, {
        puppetPins: (active.puppetPins ?? []).filter(
          (pin) => pin.id !== selectedPuppetPinId,
        ),
      });
      if (next === getDoc()) return false;
      commitTransformChange(setDoc, next);
      setSelectedPuppetPin(null);
      return true;
    },

    /** The current rotation (degrees, wrapped to ±180) of a pin, or 0. */
    getPuppetPinRotation(pinId) {
      const active = getSelectedId()
        ? findNode(getDoc(), getSelectedId())
        : null;
      const pin = active?.puppetPins?.find((entry) => entry.id === pinId);
      return pin ? normalizeDeg(radToDeg(pin.rotation ?? 0)) : 0;
    },

    /**
     * Sets the ABSOLUTE rotation (degrees) of a pin: the pin's own (x, y) is
     * pivoted about the image centre so the surrounding mesh follows through
     * applyPuppetPins, then the mesh is refreshed in the same history entry.
     * A pin pinned exactly at the image centre has a zero lever arm and stays
     * put (only its rotation state advances).
     */
    setPuppetPinRotation(pinId, angleDeg) {
      const active = getSelectedId()
        ? findNode(getDoc(), getSelectedId())
        : null;
      const pin = active?.puppetPins?.find((entry) => entry.id === pinId);
      if (!active || !pin) return false;
      const target = Number(angleDeg);
      if (!Number.isFinite(target)) return false;
      const currentDeg = normalizeDeg(radToDeg(pin.rotation ?? 0));
      const deltaRad = degToRad(target) - degToRad(currentDeg);
      if (Math.abs(deltaRad) < 1e-12) return false;
      const pivot = { x: 0.5, y: 0.5 };
      const nextPins = rotatePuppetPin(
        active.puppetPins,
        pinId,
        deltaRad,
        pivot,
      );
      if (nextPins === active.puppetPins) return false;
      const nextMesh = applyPuppetPins(active.warpMesh, nextPins);
      commitTransformChange(
        setDoc,
        ops.updateNode(getDoc(), active.id, {
          puppetPins: nextPins,
          warpMesh: nextMesh,
        }),
      );
      return true;
    },

    /** Moves a pin to the front (end) or back (start) of its stacking order. */
    movePuppetPinDepth(pinId, direction) {
      const active = getSelectedId()
        ? findNode(getDoc(), getSelectedId())
        : null;
      if (!active || !active.puppetPins) return false;
      const nextPins = movePinDepth(active.puppetPins, pinId, direction);
      if (nextPins === active.puppetPins) return false;
      const nextMesh = applyPuppetPins(active.warpMesh, nextPins);
      commitTransformChange(
        setDoc,
        ops.updateNode(getDoc(), active.id, {
          puppetPins: nextPins,
          warpMesh: nextMesh,
        }),
      );
      return true;
    },

    /** Toggles the fixed flag of a pin on the active node. */
    togglePuppetPinFixed(pinId) {
      const active = getSelectedId()
        ? findNode(getDoc(), getSelectedId())
        : null;
      if (!active || !active.puppetPins) return false;
      const targetPin = active.puppetPins.find((p) => p.id === pinId);
      if (!targetPin) return false;
      const willFix = !targetPin.fixed;
      const nextPins = active.puppetPins.map((p) =>
        p.id === pinId
          ? {
              ...p,
              fixed: willFix,
              ...(willFix ? { x: p.restX ?? p.x, y: p.restY ?? p.y } : {}),
            }
          : { ...p },
      );
      const nextMesh = applyPuppetPins(active.warpMesh, nextPins);
      commitTransformChange(
        setDoc,
        ops.updateNode(getDoc(), active.id, {
          puppetPins: nextPins,
          warpMesh: nextMesh,
        }),
      );
      return true;
    },
  };
}
