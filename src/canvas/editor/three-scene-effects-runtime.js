/** Lazily loaded post-processing pipeline shared by editor and capture renderers. */
export function hasActiveSceneEffects(effects) {
  return effects?.enabled === true && [
    effects.bloom?.enabled,
    effects.vignette?.enabled,
    effects.grain?.enabled,
    effects.chromaticAberration?.enabled,
  ].some(Boolean);
}

export async function loadThreeSceneEffectPasses() {
  const [composer, render, shader, bloom, output] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/ShaderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ]);
  return {
    EffectComposer: composer.EffectComposer,
    RenderPass: render.RenderPass,
    ShaderPass: shader.ShaderPass,
    UnrealBloomPass: bloom.UnrealBloomPass,
    OutputPass: output.OutputPass,
  };
}

export const SceneEffectsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignetteEnabled: { value: 0 },
    uVignetteOffset: { value: 0.5 },
    uVignetteDarkness: { value: 0.35 },
    uGrainEnabled: { value: 0 },
    uGrainAmount: { value: 0.15 },
    uGrainSeed: { value: 0 },
    uChromaticEnabled: { value: 0 },
    uChromaticOffset: { value: 0.002 },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignetteEnabled, uVignetteOffset, uVignetteDarkness;
    uniform float uGrainEnabled, uGrainAmount, uGrainSeed;
    uniform float uChromaticEnabled, uChromaticOffset;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uGrainSeed*74.7)*43758.5453);}
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      if(uChromaticEnabled>0.5){vec2 shift=(vUv-0.5)*uChromaticOffset;color.r=texture2D(tDiffuse,vUv+shift).r;color.b=texture2D(tDiffuse,vUv-shift).b;}
      if(uVignetteEnabled>0.5){float edge=distance(vUv,vec2(0.5));float shade=smoothstep(min(uVignetteOffset,0.706),0.7071,edge);color.rgb*=1.0-shade*uVignetteDarkness;}
      if(uGrainEnabled>0.5){color.rgb+=(hash(gl_FragCoord.xy)-0.5)*uGrainAmount;}
      gl_FragColor=color;
    }`,
};

export async function createSceneEffectsPipeline({
  renderer, scene, camera, effects, width, height,
  loadPasses = loadThreeSceneEffectPasses,
}) {
  if (!hasActiveSceneEffects(effects)) return null;
  const { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass } = await loadPasses();
  const composer = new EffectComposer(renderer);
  const passes = [];
  const own = (pass) => { passes.push(pass); composer.addPass(pass); return pass; };
  own(new RenderPass(scene, camera));
  let bloomPass = null;
  if (effects.bloom?.enabled) {
    const pass = own(new UnrealBloomPass(
      { x: width, y: height }, effects.bloom.strength,
      effects.bloom.radius, effects.bloom.threshold,
    ));
    bloomPass = pass;
    pass.enabled = true;
  }
  const shaderPass = own(new ShaderPass(SceneEffectsShader));
  own(new OutputPass());
  const uniforms = shaderPass.uniforms;
  uniforms.uVignetteEnabled.value = Number(effects.vignette?.enabled === true);
  uniforms.uVignetteOffset.value = effects.vignette?.offset ?? 0.5;
  uniforms.uVignetteDarkness.value = effects.vignette?.darkness ?? 0.35;
  uniforms.uGrainEnabled.value = Number(effects.grain?.enabled === true);
  uniforms.uGrainAmount.value = effects.grain?.amount ?? 0.15;
  uniforms.uChromaticEnabled.value = Number(effects.chromaticAberration?.enabled === true);
  uniforms.uChromaticOffset.value = effects.chromaticAberration?.offset ?? 0.002;
  composer.setSize(width, height);
  let disposed = false;
  return {
    composer,
    setSceneCamera(nextScene, nextCamera) {
      const renderPass = passes.find((pass) => pass.scene && pass.camera);
      if (renderPass) { renderPass.scene = nextScene; renderPass.camera = nextCamera; }
    },
    update(nextEffects) {
      if (disposed) return;
      if (bloomPass) {
        bloomPass.strength = nextEffects?.bloom?.strength ?? bloomPass.strength;
        bloomPass.radius = nextEffects?.bloom?.radius ?? bloomPass.radius;
        bloomPass.threshold = nextEffects?.bloom?.threshold ?? bloomPass.threshold;
      }
      uniforms.uVignetteOffset.value = nextEffects?.vignette?.offset ?? uniforms.uVignetteOffset.value;
      uniforms.uVignetteDarkness.value = nextEffects?.vignette?.darkness ?? uniforms.uVignetteDarkness.value;
      uniforms.uGrainAmount.value = nextEffects?.grain?.amount ?? uniforms.uGrainAmount.value;
      uniforms.uChromaticOffset.value = nextEffects?.chromaticAberration?.offset ?? uniforms.uChromaticOffset.value;
    },
    render(time = 0) {
      if (disposed) return;
      uniforms.uGrainSeed.value = Number.isFinite(time) ? time : 0;
      composer.render();
    },
    resize(nextWidth, nextHeight) { composer.setSize(nextWidth, nextHeight); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const pass of passes) pass.dispose?.();
      composer.dispose?.();
    },
  };
}

export function createSceneEffectsController({ renderer, scene, getCamera, loadPasses }) {
  let pipeline = null;
  let generation = 0;
  let structureKey = null;
  let latestEffects = null;
  let size = [1, 1];
  let disposed = false;
  async function configure(effects) {
    const active = hasActiveSceneEffects(effects);
    const key = active
      ? ["bloom", "vignette", "grain", "chromaticAberration"]
          .filter((name) => effects[name]?.enabled)
          .join(",")
      : "off";
    latestEffects = effects;
    if (structureKey === key) {
      pipeline?.update(effects);
      return;
    }
    structureKey = key;
    const id = ++generation;
    pipeline?.dispose();
    pipeline = null;
    if (!active) return;
    const result = await createSceneEffectsPipeline({
      renderer, scene, camera: getCamera(), effects,
      width: size[0], height: size[1],
      ...(loadPasses ? { loadPasses } : {}),
    });
    if (disposed || id !== generation) result?.dispose();
    else {
      pipeline = result;
      pipeline?.update(latestEffects);
    }
  }
  return {
    configure,
    isReady() { return !hasActiveSceneEffects(latestEffects) || Boolean(pipeline); },
    activeEffects() {
      if (!hasActiveSceneEffects(latestEffects)) return "";
      return ["bloom", "vignette", "grain", "chromaticAberration"]
        .filter((name) => latestEffects[name]?.enabled)
        .join(",");
    },
    resize(width, height) { size = [width, height]; pipeline?.resize(width, height); },
    render(time = 0) {
      if (pipeline) { pipeline.setSceneCamera(scene, getCamera()); pipeline.render(time); }
      else renderer.render(scene, getCamera());
    },
    dispose() { disposed = true; generation++; pipeline?.dispose(); pipeline = null; },
  };
}
