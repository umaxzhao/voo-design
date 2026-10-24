/**
 * The multi-pass spatial stage for the GPU adjustment path.
 *
 * Blur and sharpen are convolutions: they read neighbouring pixels, so they
 * cannot fold into the tone LUT the way brightness or curves do. They need the
 * tone pass to land somewhere sampleable first — an offscreen framebuffer —
 * which is what this module adds on top of the single-draw pipeline in
 * gl_adjustments.js:
 *
 *   tone pass -> FBO A -> spatial passes -> screen
 *
 * Same best-effort contract as gl_adjustments.js: any failure makes the stage
 * report itself unusable and the caller falls back to the CPU path.
 */

import {
  BLUR_FRAGMENT_SHADER,
  buildProgram,
  CLARITY_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
  FULLSCREEN_VERTEX_SHADER_FBO,
  HIGH_PASS_FRAGMENT_SHADER,
  MOTION_BLUR_FRAGMENT_SHADER,
  SHARPEN_FRAGMENT_SHADER,
} from "./gl_spatial_shaders.js";
import {
  createSpatialTarget,
  deleteSpatialTarget,
  drawBlurPass as runBlurPass,
  drawDetailPass as runDetailPass,
  drawMotionBlurPass as runMotionBlurPass,
  drawSharpenPass as runSharpenPass,
} from "./gl_spatial_passes.js";

export { buildProgram, FULLSCREEN_VERTEX_SHADER, FULLSCREEN_VERTEX_SHADER_FBO };
/**
 * Creates the spatial stage bound to one WebGL2 context.
 *
 * `accounting` is `{ add(bytes), remove(bytes) }` into the renderer's texture
 * budget, so the two FBO textures count against the same 512MB LRU pool as
 * source uploads.
 */
export function createSpatialStage(gl, accounting) {
  let blurProgram = null;
  let sharpenProgram = null;
  let highPassProgram = null;
  let clarityProgram = null;
  let motionBlurProgram = null;
  let blurUniforms = null;
  let sharpenUniforms = null;
  let highPassUniforms = null;
  let clarityUniforms = null;
  let motionBlurUniforms = null;

  /** Ping-pong targets: { a, b, width, height } with { fbo, texture } entries. */
  let targets = null;
  let targetBytes = 0;

  /** Set by any failure; begin() keeps declining until invalidate() resets. */
  let broken = false;

  function disposeTargets() {
    if (!targets) return;
    deleteSpatialTarget(gl, targets.a);
    deleteSpatialTarget(gl, targets.b);
    targets = null;
    accounting.remove(targetBytes);
    targetBytes = 0;
  }

  function ensure(width, height) {
    if (broken) return false;
    try {
      if (!blurProgram) {
        blurProgram = buildProgram(
          gl,
          BLUR_FRAGMENT_SHADER,
          FULLSCREEN_VERTEX_SHADER_FBO,
        );
        blurUniforms = {
          image: gl.getUniformLocation(blurProgram, "u_image"),
          texel: gl.getUniformLocation(blurProgram, "u_texel"),
          direction: gl.getUniformLocation(blurProgram, "u_direction"),
          radius: gl.getUniformLocation(blurProgram, "u_radius"),
          sigma: gl.getUniformLocation(blurProgram, "u_sigma"),
        };
      }
      if (!sharpenProgram) {
        sharpenProgram = buildProgram(
          gl,
          SHARPEN_FRAGMENT_SHADER,
          FULLSCREEN_VERTEX_SHADER_FBO,
        );
        sharpenUniforms = {
          image: gl.getUniformLocation(sharpenProgram, "u_image"),
          texel: gl.getUniformLocation(sharpenProgram, "u_texel"),
          amount: gl.getUniformLocation(sharpenProgram, "u_amount"),
        };
      }
      if (!highPassProgram) {
        highPassProgram = buildProgram(
          gl,
          HIGH_PASS_FRAGMENT_SHADER,
          FULLSCREEN_VERTEX_SHADER_FBO,
        );
        highPassUniforms = {
          image: gl.getUniformLocation(highPassProgram, "u_image"),
          texel: gl.getUniformLocation(highPassProgram, "u_texel"),
          radius: gl.getUniformLocation(highPassProgram, "u_radius"),
          sigma: gl.getUniformLocation(highPassProgram, "u_sigma"),
        };
      }
      if (!clarityProgram) {
        clarityProgram = buildProgram(
          gl,
          CLARITY_FRAGMENT_SHADER,
          FULLSCREEN_VERTEX_SHADER_FBO,
        );
        clarityUniforms = {
          image: gl.getUniformLocation(clarityProgram, "u_image"),
          texel: gl.getUniformLocation(clarityProgram, "u_texel"),
          radius: gl.getUniformLocation(clarityProgram, "u_radius"),
          sigma: gl.getUniformLocation(clarityProgram, "u_sigma"),
          strength: gl.getUniformLocation(clarityProgram, "u_strength"),
        };
      }
      if (!motionBlurProgram) {
        motionBlurProgram = buildProgram(
          gl,
          MOTION_BLUR_FRAGMENT_SHADER,
          FULLSCREEN_VERTEX_SHADER_FBO,
        );
        motionBlurUniforms = {
          image: gl.getUniformLocation(motionBlurProgram, "u_image"),
          texel: gl.getUniformLocation(motionBlurProgram, "u_texel"),
          direction: gl.getUniformLocation(motionBlurProgram, "u_direction"),
          radius: gl.getUniformLocation(motionBlurProgram, "u_radius"),
        };
      }
      if (targets && (targets.width !== width || targets.height !== height)) {
        disposeTargets();
      }
      if (!targets) {
        const a = createSpatialTarget(gl, width, height);
        const b = a ? createSpatialTarget(gl, width, height) : null;
        if (!a || !b) {
          deleteSpatialTarget(gl, a);
          deleteSpatialTarget(gl, b);
          broken = true;
          return false;
        }
        targets = { a, b, width, height };
        targetBytes = width * height * 4 * 2;
        accounting.add(targetBytes);
      }
      return true;
    } catch (error) {
      console.error("WebGL spatial stage unavailable", error);
      broken = true;
      return false;
    }
  }

  const drawBlurPass = (...args) =>
    runBlurPass(gl, blurProgram, blurUniforms, ...args);
  const drawSharpenPass = (...args) =>
    runSharpenPass(gl, sharpenProgram, sharpenUniforms, ...args);
  const drawDetailPass = (...args) => runDetailPass(gl, ...args);
  const drawMotionBlurPass = (...args) =>
    runMotionBlurPass(gl, motionBlurProgram, motionBlurUniforms, ...args);

  return {
    /**
     * Prepares the stage and binds FBO A as the render target for the tone
     * pass. Returns false — leaving the default framebuffer untouched — when
     * the stage cannot run, so the caller can hand the frame to the CPU path.
     */
    begin(width, height) {
      if (!ensure(width, height)) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.a.fbo);
      gl.viewport(0, 0, width, height);
      return true;
    },

    /**
     * Runs the convolution passes after the tone pass, ending with a draw to
     * the default framebuffer (the shared canvas).
     */
    finish({
      width,
      height,
      blurRadius = 0,
      sharpenAmount = 0,
      highPassRadius = 0,
      clarityRadius = 0,
      clarityStrength = 0,
      motionBlurRadius = 0,
      motionBlurAngle = 0,
      liveFilters = [],
    }) {
      const blurActive = blurRadius > 0;
      const sharpenActive = sharpenAmount > 0;
      const highPassActive = highPassRadius > 0;
      const clarityActive = clarityRadius > 0 && clarityStrength !== 0;
      const motionActive = motionBlurRadius > 0;

      let readTexture = targets.a.texture;
      let writeFbo = targets.b.fbo;
      let writeTexture = targets.b.texture;

      const swap = () => {
        readTexture = writeTexture;
        if (writeTexture === targets.b.texture) {
          writeFbo = targets.a.fbo;
          writeTexture = targets.a.texture;
        } else {
          writeFbo = targets.b.fbo;
          writeTexture = targets.b.texture;
        }
      };

      const remainingAfter = (flags) => flags.some(Boolean);

      if (blurActive) {
        const sigma = Math.max(blurRadius * 0.5, 1e-3);
        const last = !remainingAfter([
          sharpenActive,
          highPassActive,
          clarityActive,
          motionActive,
          liveFilters.length > 0,
        ]);
        drawBlurPass(
          readTexture,
          writeFbo,
          width,
          height,
          blurRadius,
          sigma,
          1,
          0,
        );
        swap();
        drawBlurPass(
          readTexture,
          last ? null : writeFbo,
          width,
          height,
          blurRadius,
          sigma,
          0,
          1,
        );
        if (last) return;
        swap();
      }

      if (motionActive) {
        const angle = ((Number(motionBlurAngle) || 0) * Math.PI) / 180;
        const last = !remainingAfter([
          sharpenActive,
          highPassActive,
          clarityActive,
          liveFilters.length > 0,
        ]);
        drawMotionBlurPass(
          readTexture,
          last ? null : writeFbo,
          width,
          height,
          motionBlurRadius,
          Math.cos(angle),
          Math.sin(angle),
        );
        if (last) return;
        swap();
      }

      if (highPassActive) {
        const last = !remainingAfter([sharpenActive, clarityActive, liveFilters.length > 0]);
        drawDetailPass(
          highPassProgram,
          highPassUniforms,
          readTexture,
          last ? null : writeFbo,
          width,
          height,
          highPassRadius,
        );
        if (last) return;
        swap();
      }

      if (clarityActive) {
        const last = !sharpenActive && liveFilters.length === 0;
        drawDetailPass(
          clarityProgram,
          clarityUniforms,
          readTexture,
          last ? null : writeFbo,
          width,
          height,
          clarityRadius,
          (u) => gl.uniform1f(u.strength, clarityStrength),
        );
        if (last) return;
        swap();
      }

      if (sharpenActive) {
        const last = liveFilters.length === 0;
        if (last) drawSharpenPass(readTexture, width, height, sharpenAmount);
        else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
          gl.viewport(0, 0, width, height);
          gl.useProgram(sharpenProgram);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readTexture);
          gl.uniform1i(sharpenUniforms.image, 0);
          gl.uniform2f(sharpenUniforms.texel, 1 / width, 1 / height);
          gl.uniform1f(sharpenUniforms.amount, sharpenAmount);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          swap();
        }
      }

      liveFilters.forEach((filter, index) => {
        const last = index === liveFilters.length - 1;
        if (filter.kind === "blur") {
          const sigma = Math.max(filter.radius * 0.5, 1e-3);
          drawBlurPass(readTexture, writeFbo, width, height, filter.radius, sigma, 1, 0);
          swap();
          drawBlurPass(readTexture, last ? null : writeFbo, width, height, filter.radius, sigma, 0, 1);
        } else if (filter.kind === "motionBlur") {
          const target = last ? null : writeFbo;
          const angle = (filter.angle * Math.PI) / 180;
          drawMotionBlurPass(readTexture, target, width, height, filter.radius, Math.cos(angle), Math.sin(angle));
        } else if (filter.kind === "highPass" || filter.kind === "clarity") {
          const target = last ? null : writeFbo;
          const program = filter.kind === "highPass" ? highPassProgram : clarityProgram;
          const uniforms = filter.kind === "highPass" ? highPassUniforms : clarityUniforms;
          drawDetailPass(program, uniforms, readTexture, target, width, height, filter.radius, filter.kind === "clarity" ? (u) => gl.uniform1f(u.strength, filter.strength) : null);
        } else if (filter.kind === "sharpen") {
          if (last) drawSharpenPass(readTexture, width, height, filter.amount);
          else {
            const target = writeFbo;
            gl.bindFramebuffer(gl.FRAMEBUFFER, target);
            gl.viewport(0, 0, width, height);
            gl.useProgram(sharpenProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, readTexture);
            gl.uniform1i(sharpenUniforms.image, 0);
            gl.uniform2f(sharpenUniforms.texel, 1 / width, 1 / height);
            gl.uniform1f(sharpenUniforms.amount, filter.amount);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
        }
        if (!last) swap();
      });
    },

    /**
     * Context lost: the GPU objects are gone already, so this only drops the
     * bookkeeping. Everything rebuilds lazily on the next begin().
     */
    invalidate() {
      blurProgram = null;
      sharpenProgram = null;
      highPassProgram = null;
      clarityProgram = null;
      motionBlurProgram = null;
      targets = null;
      if (targetBytes) {
        accounting.remove(targetBytes);
        targetBytes = 0;
      }
      broken = false;
    },

    dispose() {
      disposeTargets();
      for (const program of [
        blurProgram,
        sharpenProgram,
        highPassProgram,
        clarityProgram,
        motionBlurProgram,
      ]) {
        if (program) gl.deleteProgram(program);
      }
      blurProgram = null;
      sharpenProgram = null;
      highPassProgram = null;
      clarityProgram = null;
      motionBlurProgram = null;
      broken = true;
    },
  };
}
