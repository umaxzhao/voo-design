/**
 * Adjustment renderer pipeline implementation.
 *
 * One WebGL2 context serves the renderer, executing tone mapping, hue shifts,
 * and vignette in a single draw call with fallback to CPU when needed.
 */

import { buildToneLut } from "./tone_lut.js";
import { buildProgram, createSpatialStage } from "./gl_spatial.js";
import { scaledRadius } from "./spatial_filter.js";
import { FRAGMENT_SHADER, packBands } from "./gl_adjustments_shaders.js";
import {
  TEXTURE_BUDGET_BYTES,
  exceedsTextureLimit,
  uploadSourceTexture,
  uploadToneTexture,
  evictOldestTextures,
} from "./gl_adjustments_textures.js";

/**
 * Creates an adjustment renderer instance.
 */
export function createAdjustmentRenderer() {
  let canvas = null;
  let gl = null;
  let program = null;
  let uniforms = null;
  let toneTexture = null;
  let toneSignature = null;
  const tonePixels = new Uint8Array(256 * 4);

  /** source/matte object -> { texture, bytes, dirty, lastUsed }. */
  const textures = new Map();
  let textureBytes = 0;
  let clock = 0;

  /**
   * The FBO multi-pass stage for blur/sharpen, created lazily on first use.
   * Its textures count against the same budget as source uploads.
   */
  let spatialStage = null;
  const spatialAccounting = {
    add(bytes) {
      textureBytes += bytes;
    },
    remove(bytes) {
      textureBytes -= bytes;
    },
  };

  /**
   * Rendered output, so a frame that changes nothing does not re-run the pass.
   */
  const results = new WeakMap();
  const pending = new WeakMap();
  const matteVersions = new WeakMap();

  const matteVersion = (matte) => (matte ? (matteVersions.get(matte) ?? 0) : 0);

  /** Set once the context is known to be unusable; never retried. */
  let failed = false;
  let contextLost = false;
  let maxTextureSize = 0;

  function releaseAllTextures() {
    if (gl) {
      for (const entry of textures.values()) gl.deleteTexture(entry.texture);
    }
    textures.clear();
    textureBytes = 0;
  }

  function onContextLost(event) {
    // Without preventDefault the context is never restored.
    event.preventDefault();
    contextLost = true;
    program = null;
    uniforms = null;
    toneTexture = null;
    toneSignature = null;
    // The GPU objects are gone already; just drop our bookkeeping. The stage
    // returns its FBO bytes to the budget first, then everything zeroes.
    textures.clear();
    spatialStage?.invalidate();
    textureBytes = 0;
    console.warn("WebGL context lost; adjustments fall back to the CPU path");
  }

  function onContextRestored() {
    contextLost = false;
    // The program and every texture are rebuilt lazily on the next render.
  }

  function ensureContext() {
    if (failed || contextLost) return false;
    if (gl && program) return true;
    if (typeof document === "undefined") {
      failed = true;
      return false;
    }

    try {
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);
      }
      if (!gl) {
        gl = canvas.getContext("webgl2", {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        });
        if (!gl) {
          failed = true;
          return false;
        }
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      }

      program = buildProgram(gl, FRAGMENT_SHADER);
      uniforms = {
        image: gl.getUniformLocation(program, "u_image"),
        matte: gl.getUniformLocation(program, "u_matte"),
        tone: gl.getUniformLocation(program, "u_tone"),
        hasMatte: gl.getUniformLocation(program, "u_hasMatte"),
        hueActive: gl.getUniformLocation(program, "u_hueActive"),
        satActive: gl.getUniformLocation(program, "u_satActive"),
        lightActive: gl.getUniformLocation(program, "u_lightActive"),
        colorizeActive: gl.getUniformLocation(program, "u_colorizeActive"),
        bandsActive: gl.getUniformLocation(program, "u_bandsActive"),
        hue: gl.getUniformLocation(program, "u_hue"),
        satScale: gl.getUniformLocation(program, "u_satScale"),
        lightDelta: gl.getUniformLocation(program, "u_lightDelta"),
        bands: gl.getUniformLocation(program, "u_bands"),
        vignette: gl.getUniformLocation(program, "u_vignette"),
      };
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return true;
    } catch (error) {
      // A broken driver must degrade, not crash the editor — but it must also
      // say so once, loudly, rather than silently rendering nothing.
      console.error("WebGL adjustments unavailable", error);
      failed = true;
      return false;
    }
  }

  function evictIfNeeded() {
    textureBytes = evictOldestTextures(
      gl,
      textures,
      textureBytes,
      clock,
      TEXTURE_BUDGET_BYTES,
    );
  }

  /** Uploads (or re-uploads) a bitmap-like source and returns its texture. */
  function textureFor(sourceObject) {
    const existing = textures.get(sourceObject);
    if (existing && !existing.dirty) {
      existing.lastUsed = clock;
      return existing.texture;
    }

    const uploaded = uploadSourceTexture(gl, sourceObject, existing, clock);
    if (!uploaded) return null;

    if (existing) textureBytes -= existing.bytes;
    textures.set(sourceObject, uploaded);
    textureBytes += uploaded.bytes;
    evictIfNeeded();
    return uploaded.texture;
  }

  function ensureToneTexture(tone) {
    if (!toneTexture) {
      toneTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, toneTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      toneSignature = null;
    }
    if (toneSignature === tone.signature) return toneTexture;

    uploadToneTexture(gl, toneTexture, tone, tonePixels);
    toneSignature = tone.signature;
    return toneTexture;
  }

  return {
    /** True when the GPU path can be used right now. */
    isAvailable() {
      return ensureContext();
    },

    /**
     * Renders one image node's pixels with its adjustments and matte applied.
     */
    render({ source, matte, adjustments, width, height }) {
      if (!source) return null;
      const tone = buildToneLut(adjustments);
      // Nothing to do: let the caller draw the untouched bitmap.
      if (!tone.active && !matte) return null;
      // The one-click pixel filters have no GLSL kernel; fall back to the CPU
      // path so the frame is processed end to end instead of half-applied.
      if (tone.cpuOnly) return null;
      if (!ensureContext()) return null;
      // Too large to upload: fall back rather than render a dark box.
      if (exceedsTextureLimit(source, maxTextureSize)) return null;
      if (matte && exceedsTextureLimit(matte, maxTextureSize)) return null;

      const targetWidth = Math.max(
        1,
        Math.min(Math.round(width), maxTextureSize),
      );
      const targetHeight = Math.max(
        1,
        Math.min(Math.round(height), maxTextureSize),
      );

      const key = `${tone.signature}|${targetWidth}x${targetHeight}|${
        matte ? matteVersion(matte) : "none"
      }|${matteVersion(source)}`;
      const cached = results.get(source);
      if (cached && cached.key === key && cached.matte === (matte ?? null)) {
        return cached.canvas;
      }

      try {
        clock += 1;
        const imageTexture = textureFor(source);
        if (!imageTexture) return null;
        const matteTexture = matte ? textureFor(matte) : null;
        const lutTexture = ensureToneTexture(tone);

        if (canvas.width !== targetWidth) canvas.width = targetWidth;
        if (canvas.height !== targetHeight) canvas.height = targetHeight;

        const naturalWidth = source.naturalWidth ?? source.width;
        const blurRadius = scaledRadius(tone.blur, targetWidth, naturalWidth);
        const sharpenAmount = tone.sharpen / 100;
        let spatial = null;
        if (blurRadius > 0 || sharpenAmount > 0) {
          spatialStage ??= createSpatialStage(gl, spatialAccounting);
          if (!spatialStage.begin(targetWidth, targetHeight)) return null;
          spatial = spatialStage;
        } else {
          gl.viewport(0, 0, targetWidth, targetHeight);
        }

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);
        gl.uniform1i(uniforms.image, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, matteTexture ?? imageTexture);
        gl.uniform1i(uniforms.matte, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, lutTexture);
        gl.uniform1i(uniforms.tone, 2);

        gl.uniform1i(uniforms.hasMatte, matteTexture ? 1 : 0);
        gl.uniform1i(uniforms.hueActive, tone.hueActive ? 1 : 0);
        gl.uniform1i(uniforms.satActive, tone.satActive ? 1 : 0);
        gl.uniform1i(uniforms.lightActive, tone.lightActive ? 1 : 0);
        gl.uniform1i(uniforms.colorizeActive, tone.colorize ? 1 : 0);
        gl.uniform1i(uniforms.bandsActive, tone.bandsActive ? 1 : 0);
        gl.uniform1f(uniforms.hue, tone.hue);
        gl.uniform1f(uniforms.satScale, tone.satScale);
        gl.uniform1f(uniforms.lightDelta, tone.lightness);
        if (tone.bandsActive) {
          gl.uniform3fv(uniforms.bands, packBands(tone.bands));
        }
        gl.uniform1f(uniforms.vignette, tone.vignette / 100);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Blur H -> blur V -> sharpen, ending on the default framebuffer.
        spatial?.finish({
          width: targetWidth,
          height: targetHeight,
          blurRadius,
          sharpenAmount,
        });

        // Stable request seen twice: worth keeping.
        if (pending.get(source) === key) {
          const store = cached?.canvas ?? document.createElement("canvas");
          if (store.width !== targetWidth) store.width = targetWidth;
          if (store.height !== targetHeight) store.height = targetHeight;
          const storeCtx = store.getContext("2d");
          if (storeCtx) {
            storeCtx.clearRect(0, 0, targetWidth, targetHeight);
            storeCtx.drawImage(canvas, 0, 0);
            store.__warpTextureVersion = (store.__warpTextureVersion ?? 0) + 1;
            results.set(source, { key, canvas: store, matte: matte ?? null });
            return store;
          }
        }
        pending.set(source, key);
        return canvas;
      } catch (error) {
        console.error("WebGL adjustment render failed", error);
        failed = true;
        return null;
      }
    },

    invalidateMatte(matte) {
      if (!matte) return;
      const entry = textures.get(matte);
      if (entry) entry.dirty = true;
      matteVersions.set(matte, matteVersion(matte) + 1);
    },

    release(sourceObject) {
      if (sourceObject) {
        results.delete(sourceObject);
        pending.delete(sourceObject);
      }
      const entry = sourceObject && textures.get(sourceObject);
      if (!entry) return;
      if (gl) gl.deleteTexture(entry.texture);
      textures.delete(sourceObject);
      textureBytes -= entry.bytes;
    },

    stats() {
      return {
        textures: textures.size,
        bytes: textureBytes,
        contextLost,
        failed,
      };
    },

    dispose() {
      spatialStage?.dispose();
      spatialStage = null;
      releaseAllTextures();
      if (gl) {
        if (toneTexture) gl.deleteTexture(toneTexture);
        if (program) gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
      }
      toneTexture = null;
      toneSignature = null;
      program = null;
      uniforms = null;
      gl = null;
      canvas = null;
      failed = true;
    },
  };
}
