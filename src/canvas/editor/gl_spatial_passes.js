import { cpuBlurRadius } from "./spatial_filter.js";
/** Shared draw routines for the spatial stage's framebuffer passes. */
export function deleteSpatialTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.texture);
}

/** Allocate one framebuffer target with a clamp-to-edge RGBA texture. */
export function createSpatialTarget(gl, width, height) {
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

export function drawBlurPass(
  gl,
  program,
  uniforms,
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
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform2f(uniforms.texel, 1 / width, 1 / height);
  gl.uniform2f(uniforms.direction, dirX, dirY);
  gl.uniform1f(uniforms.radius, radius);
  gl.uniform1f(uniforms.sigma, sigma);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function drawSharpenPass(gl, program, uniforms, sourceTexture, width, height, amount) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform2f(uniforms.texel, 1 / width, 1 / height);
  gl.uniform1f(uniforms.amount, amount);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function drawDetailPass(
  gl,
  program,
  uniforms,
  sourceTexture,
  targetFbo,
  width,
  height,
  radius,
  extra,
  blurredTexture,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(uniforms.image, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, blurredTexture);
  gl.uniform1i(uniforms.blurred, 1);
  gl.uniform1f(uniforms.radius, radius);
  if (extra) extra(uniforms);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** Run three horizontal/vertical box pairs into RGBA8 intermediate targets. */
export function drawBoxBlur(gl, program, uniforms, sourceTexture, firstTarget, secondTarget, width, height, radius) {
  let source = sourceTexture;
  for (let pass = 0; pass < 6; pass++) {
    const horizontal = pass % 2 === 0;
    const target = pass % 2 === 0 ? firstTarget : secondTarget;
    const targetFbo = target.fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(uniforms.image, 0);
    gl.uniform2i(uniforms.axis, horizontal ? 1 : 0, horizontal ? 0 : 1);
    gl.uniform1i(uniforms.radius, radius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    source = target.texture;
  }
  return source;
}

export function drawMotionBlurPass(
  gl,
  program,
  uniforms,
  sourceTexture,
  targetFbo,
  width,
  height,
  radius,
  dirX,
  dirY,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform2f(uniforms.texel, 1 / width, 1 / height);
  gl.uniform2f(uniforms.direction, dirX, dirY);
  gl.uniform1f(uniforms.radius, Math.round(cpuBlurRadius(radius)));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
