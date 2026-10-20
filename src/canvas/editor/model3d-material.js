/** Reset imported GLTF materials first; scene parameters are optional overrides. */
export function applyModelMaterials(originalMaterials, model) {
  for (const [material, original] of originalMaterials) {
    if (original.color) {
      material.color.copy(original.color);
      if (model?.color) material.color.set(model.color);
    }
    if (original.metalness !== undefined) {
      material.metalness = model?.metalness ?? original.metalness;
    }
    if (original.roughness !== undefined) {
      material.roughness = model?.roughness ?? original.roughness;
    }
  }
}
