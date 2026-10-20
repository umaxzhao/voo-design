const materialGrades = new WeakMap();

export function resizeOrthographicCamera(
  THREE,
  camera,
  doc,
  width,
  height,
  autoZoom,
) {
  if (!camera?.isOrthographicCamera) return;
  const aspect = width / height;
  const extent = autoZoom
    ? Math.max(doc.height, doc.width / aspect) * 0.6
    : Math.max((camera.top - camera.bottom) / 2, Number.EPSILON);
  camera.left = -extent * aspect;
  camera.right = extent * aspect;
  camera.top = extent;
  camera.bottom = -extent;
  camera.updateProjectionMatrix();
}

export function createSceneGrid(THREE, { width, height, plane, step }) {
  if (plane === "off") return null;
  const requestedSize = Math.max(width, height) * 2;
  const divisions = THREE.MathUtils.clamp(
    Math.round(requestedSize / step),
    1,
    512,
  );
  const size = divisions * step;
  const grid = new THREE.GridHelper(size, divisions, 0x525252, 0x393939);
  if (plane === "xy") {
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -1;
  } else if (plane === "yz") {
    grid.rotation.z = Math.PI / 2;
    grid.position.x = -width / 2 - 1;
  } else {
    grid.position.y = -height / 2 - 1;
  }
  grid.userData.size = size;
  grid.userData.divisions = divisions;
  grid.userData.plane = plane;
  grid.userData.step = step;
  grid.raycast = () => {};
  return grid;
}

function colorBytes(hex) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

function createBackgroundTexture(THREE, settings) {
  const skyEnabled = settings.sky.enabled;
  const top = colorBytes(
    skyEnabled ? settings.sky.color : settings.backgroundColor,
  );
  const bottom = colorBytes(
    skyEnabled && settings.sky.mode === "gradient"
      ? settings.sky.horizonColor
      : skyEnabled
        ? settings.sky.color
        : settings.backgroundColor,
  );
  const alpha = Math.round(settings.backgroundOpacity * 255);
  const texture = new THREE.DataTexture(
    new Uint8Array([...bottom, alpha, ...top, alpha]),
    1,
    2,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function applyMaterialGrade(material, grading) {
  if (!material || !material.isMaterial) return;
  let state = materialGrades.get(material);
  if (!state) {
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey.bind(material);
    state = { saturation: 1, uniforms: null };
    material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      previousCompile?.call(this, shader, renderer);
      const anchor = "#include <tonemapping_fragment>";
      if (!shader.fragmentShader.includes(anchor)) return;
      shader.uniforms.uVooSceneSaturation = { value: state.saturation };
      shader.fragmentShader = `uniform float uVooSceneSaturation;\n${shader.fragmentShader}`.replace(
        anchor,
        `float vooSceneLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(vec3(vooSceneLuminance), outgoingLight, uVooSceneSaturation);\n${anchor}`,
      );
      state.uniforms = shader.uniforms;
    };
    material.customProgramCacheKey = () =>
      `${previousCacheKey()}|voo-scene-grade`;
    materialGrades.set(material, state);
    material.needsUpdate = true;
  }
  state.saturation = grading.saturation;
  if (state.uniforms) {
    state.uniforms.uVooSceneSaturation.value = state.saturation;
  }
}

/** Apply persisted visual settings to the live WebGL scene. */
export function applyThreeSceneColorGrading(root, grading) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      applyMaterialGrade(material, grading);
    }
  });
}

export function disposeThreeSceneVisualSettings(scene) {
  scene.userData.vooBackgroundTexture?.texture.dispose();
  delete scene.userData.vooBackgroundTexture;
}

export function applyThreeSceneVisualSettings({
  THREE,
  scene,
  renderer,
  directional,
  settings,
}) {
  const skyEnabled = settings.sky.enabled;
  const sceneBackgroundEnabled = settings.backgroundColor !== "transparent";
  const translucentBackground =
    sceneBackgroundEnabled && settings.backgroundOpacity < 1;
  const needsTexture =
    skyEnabled ||
    translucentBackground;
  const backgroundKey = JSON.stringify([
    settings.backgroundColor,
    settings.backgroundOpacity,
    settings.sky,
  ]);
  const previous = scene.userData.vooBackgroundTexture;
  if (needsTexture) {
    if (!previous || previous.key !== backgroundKey) {
      previous?.texture.dispose();
      const texture = createBackgroundTexture(THREE, settings);
      scene.userData.vooBackgroundTexture = { key: backgroundKey, texture };
      scene.background = texture;
    } else {
      scene.background = previous.texture;
    }
  } else {
    previous?.texture.dispose();
    delete scene.userData.vooBackgroundTexture;
    scene.background = sceneBackgroundEnabled
      ? new THREE.Color(settings.backgroundColor)
      : null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMappingExposure = 2 ** settings.colorGrading.exposure;
  scene.fog = settings.fog.enabled
    ? new THREE.Fog(settings.fog.color, settings.fog.near, settings.fog.far)
    : null;
  renderer.shadowMap.enabled = true;
  directional.castShadow = settings.shadows.enabled;
  directional.shadow.intensity = settings.shadows.intensity;
  directional.shadow.radius = settings.shadows.softness * 8;
  applyThreeSceneColorGrading(scene, settings.colorGrading);
}
