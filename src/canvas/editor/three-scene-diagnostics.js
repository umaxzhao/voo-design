/**
 * Diagnostic helpers for 3D runtime testing under ?voo-test=1.
 * Provides read-only bounds and record summaries without exposing mutable objects.
 */

export function attachThreeSceneDiagnostics({
  canvas,
  THREE,
  getRig,
  records,
  objects,
}) {
  if (
    typeof window === "undefined" ||
    !window.location?.search?.includes("voo-test=1")
  ) {
    return () => {};
  }

  if (typeof getRig !== "function") {
    throw new TypeError("3D diagnostics require a live rig reader");
  }

  canvas.__vooGetThreeSceneDiagnostics = () => {
    // Runtime initialization precedes camera creation, and switching projection
    // replaces the rig. Read it lazily so diagnostics never capture null/stale state.
    const { camera, controls } = getRig();
    const box = new THREE.Box3().setFromObject(objects);
    const min = [box.min.x, box.min.y, box.min.z];
    const max = [box.max.x, box.max.y, box.max.z];
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const recordList = [];
    for (const [id, rec] of records.entries()) {
      const recBox = new THREE.Box3().setFromObject(rec.object);
      recordList.push({
        id,
        nodeId: rec.object?.userData?.nodeId ?? id,
        isDerived: Boolean(rec.object?.userData?.isDerived),
        position: [
          rec.object.position.x,
          rec.object.position.y,
          rec.object.position.z,
        ],
        bounds: {
          min: [recBox.min.x, recBox.min.y, recBox.min.z],
          max: [recBox.max.x, recBox.max.y, recBox.max.z],
        },
      });
    }

    return {
      objectCount: records.size,
      finiteBounds: Number.isFinite(box.min.x) && Number.isFinite(box.max.x),
      unionBounds: {
        min,
        max,
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
      },
      records: recordList,
      camera: {
        position: camera
          ? [camera.position.x, camera.position.y, camera.position.z]
          : null,
        target: controls?.target
          ? [controls.target.x, controls.target.y, controls.target.z]
          : null,
      },
    };
  };

  return () => {
    delete canvas.__vooGetThreeSceneDiagnostics;
  };
}
