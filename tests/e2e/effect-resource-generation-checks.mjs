import assert from "node:assert/strict";

export async function verifyEffectResourceGenerations(page) {
  const checks = await page.evaluate(async () => {
    const renderer = await import("/src/canvas/editor/scene_renderer.js");
    const results = [];
    for (const mode of ["engine", "standalone"]) {
      for (const backdrop of ["normal", "blur", "glass"]) {
      for (const resource of ["bitmap", "mask", "late-bitmap"]) {
        const source = document.createElement("canvas"); source.width = 64; source.height = 48;
        const mask = document.createElement("canvas"); mask.width = 64; mask.height = 48;
        const sc = source.getContext("2d"), mc = mask.getContext("2d");
        sc.fillStyle = "#ff5500"; sc.fillRect(0, 0, 64, 48);
        mc.fillStyle = "#ffffff"; mc.fillRect(0, 0, 64, 48);
        let ready = resource !== "late-bitmap";
        const node = Object.freeze({ id: `live-${mode}-${resource}`, kind: "image", visible: true,
          x: 25, y: 25, width: 64, height: 48, opacity: .7, imageId: "same-image",
          ...(backdrop === "blur" ? { backgroundBlur: 2 } : {}),
          ...(resource === "mask" ? { maskId: "same-mask" } : {}),
          effects: { innerShadow: { enabled: true, offsetX: 5, offsetY: 3, blur: 4,
            color: "#001144", opacity: 90 }, ...(backdrop === "glass" ? { glass: { enabled: true, blur: 2 } } : {}) } });
        const paint = (value, generation) => {
          const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 120;
          const ctx = canvas.getContext("2d");
          renderer.drawNode(ctx, value, () => ready ? source : null,
            () => resource === "mask" ? mask : null, { fullResolution: true }, false,
            mode === "engine" ? { docVersion: generation } : null);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const before = paint(node, "resource:1");
        paint(node, "resource:1");
        if (resource === "mask") {
          mc.clearRect(0, 0, 64, 48);
          mc.fillStyle = "#ffffff"; mc.fillRect(8, 8, 40, 24);
          renderer.invalidateMatteComposite(mask);
          mask.__warpTextureVersion = 1;
        } else {
          sc.clearRect(0, 0, 64, 48);
          sc.fillStyle = "#3388ff"; sc.fillRect(8, 8, 40, 24);
          renderer.invalidateBitmapComposite(source);
          renderer.invalidateAdjustmentCache(source);
          renderer.invalidateImagePyramid(source);
          source.__warpTextureVersion = 1;
          ready = true;
        }
        const actual = paint(node, "resource:2");
        const reference = paint({ ...node }, "resource:2");
        results.push({ mode, resource, backdrop,
          equalCold: actual.length === reference.length && actual.every((v, i) => v === reference[i]),
          pixelsChanged: actual.some((v, i) => v !== before[i]) });
      }
      }
    }
    return results;
  });
  for (const result of checks) {
    assert.equal(result.pixelsChanged, true, `${result.mode}/${result.resource}/${result.backdrop}: fixture must change real pixels`);
    assert.equal(result.equalCold, true, `${result.mode}/${result.resource}/${result.backdrop}: updated resource effects must equal a cold render`);
  }
  return "same-node live bitmap/mask/readiness changes match exact cold effects with engine generations and standalone renders";
}
