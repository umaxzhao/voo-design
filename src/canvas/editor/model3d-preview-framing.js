import * as THREE from "three";

const MODEL_EXTENT = 1.6;
const FRAME_MARGIN = 1.15;

/** Center an imported scene before scaling, then fit its bounding sphere. */
export function frameModelForPreview(root, camera, width, height) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = MODEL_EXTENT / Math.max(0.001, size.x, size.y, size.z);
  const radius = Math.max(
    0.05,
    box.getBoundingSphere(new THREE.Sphere()).radius * scale,
  );

  const centered = new THREE.Group();
  centered.position.copy(center).multiplyScalar(-1);
  centered.add(root);
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  group.add(centered);

  const fit = (viewWidth, viewHeight) => {
    camera.aspect = Math.max(1, viewWidth) / Math.max(1, viewHeight);
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const halfAngle = Math.min(vertical, horizontal) / 2;
    const distance = Math.max(1, (radius / Math.sin(halfAngle)) * FRAME_MARGIN);
    camera.position.set(0, distance * 0.18, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  fit(width, height);
  return { group, fit };
}
