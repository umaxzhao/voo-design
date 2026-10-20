/** Layered diffuse color on stock Standard/Physical PBR shaders. */
/** Create one disposable Studio PMREM for a WebGL renderer, never per frame. */
export function createStudioEnvironment(THREE, renderer) {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  room.background = new THREE.Color("#777b83");
  const panels = [
    { position: [-2, 3, 4], scale: [2, 3, 1], color: "#ffffff" },
    { position: [3, 2, 1], scale: [1, 3, 1], color: "#e0e6ef" },
    { position: [-3, -1, -2], scale: [2, 1, 1], color: "#b9c2d0" },
  ];
  for (const panel of panels) {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshBasicMaterial({ color: panel.color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...panel.position);
    mesh.scale.set(...panel.scale);
    room.add(mesh);
  }
  try {
    return generator.fromScene(room);
  } finally {
    room.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    generator.dispose();
  }
}

export function getAssignedMaterialAsset(scene3d, node) {
  if (!node?.materialAssetId) return null;
  const asset = scene3d?.materialAssets?.find(
    (entry) => entry.id === node.materialAssetId,
  );
  // An id the scene no longer carries — an agent write, a collab sync or a
  // partial undo can all leave one behind — means "unassigned", not "broken":
  // both callers sit inside a render loop (setDocument, the exporter), where a
  // throw would take the whole viewport down with it. The object falls back to
  // its basic material and can be reassigned from the inspector.
  return asset ?? null;
}

export function installLayeredMaterial(THREE, material, asset, bounds) {
  if (!material?.isMeshStandardMaterial) {
    throw new TypeError(
      "Layered materials require a Standard or Physical material",
    );
  }

  const maxLayers = 8;
  const layerTypes = {
    color: 0,
    fresnel: 1,
    gradient: 2,
    matcap: 3,
    noise: 4,
    toon: 5,
    depth: 6,
    normal: 7,
    rainbow: 8,
    outline: 9,
  };
  const matcapPresets = { chrome: 0, clay: 1 };
  const blendModes = { normal: 0, multiply: 1, screen: 2, add: 3 };
  const primary = Array.from({ length: maxLayers }, () => new THREE.Vector4());
  const secondary = Array.from(
    { length: maxLayers },
    () => new THREE.Vector4(),
  );
  const modes = Array.from({ length: maxLayers }, () => new THREE.Vector4());
  const rotations = new Float32Array(maxLayers);
  const uniforms = {
    uVooLayerPrimary: { value: primary },
    uVooLayerSecondary: { value: secondary },
    uVooLayerModes: { value: modes },
    uVooLayerRotations: { value: rotations },
    uVooLayerCount: { value: 0 },
    uVooLayerBounds: { value: new THREE.Vector2(-0.5, 0.5) },
  };
  const color = new THREE.Color();
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey();

  // Fixed uniform arrays keep the shader program stable while sliders change.
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    const vertexNormalAnchor = "#include <defaultnormal_vertex>";
    const vertexPositionAnchor = "#include <project_vertex>";
    const fragmentColorAnchor = "#include <color_fragment>";
    if (
      !shader.vertexShader.includes(vertexNormalAnchor) ||
      !shader.vertexShader.includes(vertexPositionAnchor) ||
      !shader.fragmentShader.includes(fragmentColorAnchor)
    ) {
      throw new Error(
        "Three.js PBR shader chunks changed; layered material cannot compile",
      );
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vVooLayerPosition;
varying vec3 vVooLayerNormal;
varying vec3 vVooLayerViewPosition;
${shader.vertexShader}`
      .replace(
        vertexNormalAnchor,
        `${vertexNormalAnchor}\n vVooLayerNormal = transformedNormal;`,
      )
      .replace(
        vertexPositionAnchor,
        `vVooLayerPosition = transformed;\n ${vertexPositionAnchor}\n vVooLayerViewPosition = -mvPosition.xyz;`,
      );
    shader.fragmentShader = `varying vec3 vVooLayerPosition;
varying vec3 vVooLayerNormal;
varying vec3 vVooLayerViewPosition;
uniform vec4 uVooLayerPrimary[8];
uniform vec4 uVooLayerSecondary[8];
uniform vec4 uVooLayerModes[8];
uniform float uVooLayerRotations[8];
uniform int uVooLayerCount;
uniform vec2 uVooLayerBounds;

vec3 vooBlendLayer(vec3 base, vec3 top, float alpha, float mode) {
  if (mode < 0.5) return mix(base, top, alpha);
  if (mode < 1.5) return mix(base, base * top, alpha);
  if (mode < 2.5) {
    return mix(base, vec3(1.0) - (vec3(1.0) - base) * (vec3(1.0) - top), alpha);
  }
  return min(vec3(1.0), base + top * alpha);
}

// Built-in view-space Matcap presets. The normal follows the camera while
// object geometry rotates, creating the characteristic fixed studio highlight.
vec3 vooMatcap(vec3 normalDirection, vec3 viewDirection, vec3 tint, float preset, float power, float rotation) {
  vec3 reflected = reflect(-viewDirection, normalDirection);
  vec2 uv = reflected.xy * 0.5 + 0.5;
  vec2 centered = uv - 0.5;
  uv = vec2(
    centered.x * cos(rotation) - centered.y * sin(rotation),
    centered.x * sin(rotation) + centered.y * cos(rotation)
  ) + 0.5;
  if (preset < 0.5) {
    float stripe = pow(max(0.0, 1.0 - abs(uv.x - 0.72) * 3.0), 4.0 + power * 4.0);
    float softbox = pow(max(0.0, 1.0 - length((uv - vec2(0.28, 0.76)) * vec2(1.3, 1.0))), 3.0);
    float chrome = clamp(0.2 + 0.5 * uv.y + 0.8 * stripe + 0.45 * softbox, 0.0, 1.0);
    return tint * chrome;
  }
  float clayLight = pow(max(0.0, dot(normalDirection, normalize(vec3(-0.45, 0.7, 0.55)))), 1.0 + power);
  return tint * (0.35 + 0.65 * clayLight);
}

float vooNoise(vec3 position) {
  vec3 cell = floor(position);
  vec3 fraction = fract(position);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  float value = 0.0;
  for (int x = 0; x <= 1; x++) {
    for (int y = 0; y <= 1; y++) {
      for (int z = 0; z <= 1; z++) {
        vec3 corner = vec3(float(x), float(y), float(z));
        vec3 weight = mix(vec3(1.0) - fraction, fraction, corner);
        float random = fract(sin(dot(cell + corner, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        value += random * weight.x * weight.y * weight.z;
      }
    }
  }
  return value;
}

vec3 vooApplyLayers(vec3 base) {
  vec3 normalDirection = normalize(vVooLayerNormal);
  if (!gl_FrontFacing) normalDirection = -normalDirection;
  vec3 viewDirection = normalize(vVooLayerViewPosition);
  float rim = 1.0 - clamp(dot(normalDirection, viewDirection), 0.0, 1.0);
  float vertical = clamp(
    (vVooLayerPosition.y - uVooLayerBounds.x) /
      max(uVooLayerBounds.y - uVooLayerBounds.x, 0.0001),
    0.0,
    1.0
  );
  for (int index = 0; index < 8; index++) {
    if (index >= uVooLayerCount) break;
    vec4 first = uVooLayerPrimary[index];
    vec4 second = uVooLayerSecondary[index];
    vec4 mode = uVooLayerModes[index];
    float alpha = first.a * mode.z;
    vec3 top = first.rgb;
    if (mode.x > 8.5) {
      float threshold = 1.0 - 1.0 / (1.0 + second.a);
      alpha *= smoothstep(threshold - 0.08, threshold + 0.08, rim);
    } else if (mode.x > 7.5) {
      float hue = rim * second.a * 6.2831853;
      top = first.rgb * (0.5 + 0.5 * cos(hue + vec3(0.0, 2.0943951, 4.1887902)));
    } else if (mode.x > 6.5) {
      top = normalDirection * 0.5 + 0.5;
    } else if (mode.x > 5.5) {
      float depth = clamp(length(vVooLayerViewPosition) / max(second.a, 0.1), 0.0, 1.0);
      top = mix(first.rgb, second.rgb, depth);
    } else if (mode.x > 4.5) {
      float bands = clamp(floor(second.a + 0.5), 2.0, 16.0);
      float light = clamp(dot(normalDirection, normalize(vec3(-0.4, 0.7, 0.6))), 0.0, 1.0);
      top = mix(first.rgb, second.rgb, min(1.0, floor(light * bands) / max(bands - 1.0, 1.0)));
    } else if (mode.x > 3.5) {
      float frequency = max(second.a, 0.1) * 0.05;
      top = mix(first.rgb, second.rgb, vooNoise(vVooLayerPosition * frequency));
    } else if (mode.x > 2.5) {
      top = vooMatcap(normalDirection, viewDirection, first.rgb, mode.w, second.a, uVooLayerRotations[index]);
    } else if (mode.x > 1.5) {
      top = mix(first.rgb, second.rgb, pow(vertical, second.a));
    } else if (mode.x > 0.5) {
      alpha *= pow(rim, second.a);
    }
    base = vooBlendLayer(base, top, alpha, mode.y);
  }
  return base;
}
${shader.fragmentShader}`.replace(
      fragmentColorAnchor,
      `${fragmentColorAnchor}\n diffuseColor.rgb = vooApplyLayers(diffuseColor.rgb);`,
    );
  };
  material.customProgramCacheKey = () =>
    `voo-layered-pbr-2:${previousCacheKey}`;
  material.needsUpdate = true;

  function update(nextAsset, nextBounds = bounds) {
    if (!nextAsset || !Array.isArray(nextAsset.layers)) {
      throw new TypeError("A layered material asset requires a layers array");
    }
    if (nextAsset.layers.length > maxLayers) {
      throw new RangeError(`Layered material exceeds ${maxLayers} layers`);
    }
    const minY = nextBounds?.min?.y;
    const maxY = nextBounds?.max?.y;
    uniforms.uVooLayerBounds.value.set(
      Number.isFinite(minY) ? minY : -0.5,
      Number.isFinite(maxY) ? maxY : 0.5,
    );
    uniforms.uVooLayerCount.value = nextAsset.layers.length;
    for (let index = 0; index < maxLayers; index += 1) {
      const layer = nextAsset.layers[index];
      if (!layer) {
        primary[index].set(0, 0, 0, 0);
        secondary[index].set(0, 0, 0, 1);
        modes[index].set(0, 0, 0, 0);
        rotations[index] = 0;
        continue;
      }
      if (!(layer.type in layerTypes) || !(layer.blendMode in blendModes)) {
        throw new TypeError(
          "Layered material has an unsupported type or blend mode",
        );
      }
      if (layer.type === "matcap" && !(layer.matcapPreset in matcapPresets)) {
        throw new TypeError(
          "Layered material has an unsupported Matcap preset",
        );
      }
      color.set(layer.color);
      primary[index].set(
        color.r,
        color.g,
        color.b,
        Math.max(0, Math.min(1, layer.opacity ?? 1)),
      );
      color.set(layer.secondaryColor ?? "#ffffff");
      secondary[index].set(
        color.r,
        color.g,
        color.b,
        Math.max(0.001, layer.power ?? 2),
      );
      modes[index].set(
        layerTypes[layer.type],
        blendModes[layer.blendMode],
        layer.enabled === false ? 0 : 1,
        layer.type === "matcap" ? matcapPresets[layer.matcapPreset] : 0,
      );
      rotations[index] =
        layer.type === "matcap"
          ? ((layer.matcapRotation ?? 0) * Math.PI) / 180
          : 0;
    }
  }

  update(asset, bounds);
  return { update, uniforms };
}
