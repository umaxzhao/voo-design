/**
 * The multi-pass spatial stage for the GPU adjustment path.
 *
 * Blur and sharpen are convolutions: they read neighbouring pixels, so they
 * cannot fold into the tone LUT the way brightness or curves do. They need the
 * tone pass to land somewhere sampleable first — an offscreen framebuffer —
 * which is what this module adds on top of the single-draw pipeline in
 * gl_adjustments.js:
 *
 *   tone pass -> FBO A -> gaussian H (A→B) -> gaussian V (B→A or screen)
 *             -> sharpen (A→screen)
 *
 * The passes that actually run depend on the active adjustments; with neither
 * blur nor sharpen the stage is never touched and the renderer stays a single
 * draw to the default framebuffer.
 *
 * This module also owns the two pieces of shader machinery both renderers
 * share — the full-screen-triangle vertex shader and program building — so the
 * GLSL entry points cannot drift apart.
 *
 * Same best-effort contract as gl_adjustments.js: any failure (program build,
 * incomplete framebuffer, lost context) makes the stage report itself
 * unusable and the caller falls back to the CPU path. A broken stage never
 * poisons the main tone pipeline.
 */

import {
  BLUR_FRAGMENT_SHADER,
  buildProgram,
  FULLSCREEN_VERTEX_SHADER,
  FULLSCREEN_VERTEX_SHADER_FBO,
  SHARPEN_FRAGMENT_SHADER,
} from "./gl_spatial_shaders.js";

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
  let blurUniforms = null;
  let sharpenUniforms = null;

  /** Ping-pong targets: { a, b, width, height } with { fbo, texture } entries. */
  let targets = null;
  let targetBytes = 0;

  /** Set by any failure; begin() keeps declining until invalidate() resets. */
  let broken = false;

  function deleteTarget(target) {
    if (!target) return;
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
  }

  function disposeTargets() {
    if (!targets) return;
    deleteTarget(targets.a);
    deleteTarget(targets.b);
    targets = null;
    accounting.remove(targetBytes);
    targetBytes = 0;
  }

  /** One RGBA/UNSIGNED_BYTE texture the tone pass can render into. */
  function makeTarget(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      return null;
    }
    return { fbo, texture };
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
      if (targets && (targets.width !== width || targets.height !== height)) {
        disposeTargets();
      }
      if (!targets) {
        const a = makeTarget(width, height);
        const b = a ? makeTarget(width, height) : null;
        if (!a || !b) {
          deleteTarget(a);
          deleteTarget(b);
          broken = true;
          return false;
        }
        targets = { a, b, width, height };
        targetBytes = width * height * 4 * 2;
        accounting.add(targetBytes);
      }
      return true;
    } catch (error) {
      // A driver that cannot build these programs must degrade to the CPU
      // path, not crash the editor or take the tone pipeline down with it.
      console.error("WebGL spatial stage unavailable", error);
      broken = true;
      return false;
    }
  }

  function drawBlurPass(
    sourceTexture,
    targetFbo,
    width,
    height,
    radius,
    sigma,
    dirX,
    dirY,
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(blurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(blurUniforms.image, 0);
    gl.uniform2f(blurUniforms.texel, 1 / width, 1 / height);
    gl.uniform2f(blurUniforms.direction, dirX, dirY);
    gl.uniform1f(blurUniforms.radius, radius);
    gl.uniform1f(blurUniforms.sigma, sigma);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawSharpenPass(sourceTexture, width, height, amount) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(sharpenProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(sharpenUniforms.image, 0);
    gl.uniform2f(sharpenUniforms.texel, 1 / width, 1 / height);
    gl.uniform1f(sharpenUniforms.amount, amount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

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
     *
     * `blurRadius` is the effective pixel radius from scaledRadius(); pass
     * sigma tracks it at half its value, so the slider's gaussian keeps its
     * shape at any preview scale. `sharpenAmount` is the slider value / 100.
     */
    finish({ width, height, blurRadius, sharpenAmount }) {
      const blurActive = blurRadius > 0;
      const sharpenActive = sharpenAmount > 0;

      if (blurActive) {
        const sigma = Math.max(blurRadius * 0.5, 1e-3);
        // H: A -> B, then V: B -> A (when sharpen still needs a sampleable
        // input) or straight to the screen.
        drawBlurPass(
          targets.a.texture,
          targets.b.fbo,
          width,
          height,
          blurRadius,
          sigma,
          1,
          0,
        );
        drawBlurPass(
          targets.b.texture,
          sharpenActive ? targets.a.fbo : null,
          width,
          height,
          blurRadius,
          sigma,
          0,
          1,
        );
      }
      if (sharpenActive) {
        drawSharpenPass(targets.a.texture, width, height, sharpenAmount);
      }
    },

    /**
     * Context lost: the GPU objects are gone already, so this only drops the
     * bookkeeping. Everything rebuilds lazily on the next begin() after the
     * context is restored — including a fresh attempt for a `broken` stage.
     */
    invalidate() {
      blurProgram = null;
      sharpenProgram = null;
      targets = null;
      if (targetBytes) {
        accounting.remove(targetBytes);
        targetBytes = 0;
      }
      broken = false;
    },

    dispose() {
      disposeTargets();
      if (blurProgram) gl.deleteProgram(blurProgram);
      if (sharpenProgram) gl.deleteProgram(sharpenProgram);
      blurProgram = null;
      sharpenProgram = null;
      broken = true;
    },
  };
}
