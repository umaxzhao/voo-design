/** Load supported single-file 3D assets behind one scene contract. */
export async function loadModel3d(url, filename = "") {
  if (/\.obj$/i.test(filename)) {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    const scene = await new OBJLoader().loadAsync(url);
    return { scene, animations: [] };
  }

  const [loaderModule, dracoModule, meshoptModule, scriptModule, wasmModule] =
    await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
      import("three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url"),
      import("three/addons/libs/draco/gltf/draco_decoder.wasm?url"),
    ]);
  const draco = new dracoModule.DRACOLoader()
    .setDecoderPath({ js: scriptModule.default, wasm: wasmModule.default })
    .setWorkerLimit(1);
  try {
    return await new loaderModule.GLTFLoader()
      .setDRACOLoader(draco)
      .setMeshoptDecoder(meshoptModule.MeshoptDecoder)
      .loadAsync(url);
  } finally {
    draco.dispose();
  }
}
