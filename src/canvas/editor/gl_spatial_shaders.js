/**
 * Full-screen triangle straight from the vertex id: (0,0) (2,0) (0,2), so
 * there are no vertex buffers to manage.
 *
 * There are two of these because the orientation of the thing being sampled
 * differs. An uploaded image stores its rows top-down while clip space runs
 * bottom-up, so a pass reading one has to flip v. A framebuffer texture was
 * written by an earlier pass and already sits in clip-space order, so a pass
 * reading one must NOT flip — doing it anyway mirrors the picture vertically,
 * and only shows up when an odd number of passes run (sharpen alone did that).
 */
const VERTEX_BODY = `  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);`;

/** For a pass that samples an uploaded image texture. */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
out vec2 v_uv;
void main() {
${VERTEX_BODY}
  v_uv = vec2(corner.x, 1.0 - corner.y);
}`;

/** For a pass that samples a framebuffer this renderer drew earlier. */
export const FULLSCREEN_VERTEX_SHADER_FBO = `#version 300 es
out vec2 v_uv;
void main() {
${VERTEX_BODY}
  v_uv = corner;
}`;

export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * Compiles a vertex shader plus one fragment shader and links them. The vertex
 * shader defaults to the image-sampling variant; a pass that reads a
 * framebuffer must pass FULLSCREEN_VERTEX_SHADER_FBO instead.
 */
export function buildProgram(
  gl,
  fragmentSource,
  vertexSource = FULLSCREEN_VERTEX_SHADER,
) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The shaders are owned by the program once attached; drop our references
  // either way so a failed link does not leak them.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program failed to link: ${log}`);
  }
  return program;
}

/**
 * One pass of a separable gaussian. The loop bound matches MAX_BLUR_RADIUS in
 * spatial_filter.js: scaledRadius() clamps its ratio to 1, so the radius it
 * hands over never exceeds the slider's natural-resolution maximum.
 */
export const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform float u_radius;
uniform float u_sigma;

void main() {
  vec4 sum = texture(u_image, v_uv);
  float weightSum = 1.0;
  int radius = int(floor(u_radius));
  for (int i = 1; i <= 32; i++) {
    if (i > radius) break;
    float w = exp(-0.5 * float(i * i) / (u_sigma * u_sigma));
    vec2 offset = u_direction * u_texel * float(i);
    sum += texture(u_image, v_uv + offset) * w;
    sum += texture(u_image, v_uv - offset) * w;
    weightSum += 2.0 * w;
  }
  outColor = sum / weightSum;
}`;

/**
 * 3x3 unsharp cross: centre boosted, the four direct neighbours subtracted.
 * The CPU fallback in spatial_filter.js applies the same kernel, including
 * the CLAMP_TO_EDGE behaviour at the borders.
 */
export const SHARPEN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_texel;
uniform float u_amount;

void main() {
  vec4 center = texture(u_image, v_uv);
  vec4 neighbours =
    texture(u_image, v_uv + vec2(0.0, u_texel.y)) +
    texture(u_image, v_uv - vec2(0.0, u_texel.y)) +
    texture(u_image, v_uv + vec2(u_texel.x, 0.0)) +
    texture(u_image, v_uv - vec2(u_texel.x, 0.0));
  outColor = clamp(
    center * (1.0 + 4.0 * u_amount) - neighbours * u_amount,
    0.0,
    1.0
  );
}`;

/**
 * High-pass residual: mid-grey + (original - blurred). `u_image` is the
 * pre-blur source; `u_blurred` is the result of the separable blur passes.
 * Matches spatial_filter.applyHighPass (128/255 centre).
 */

/**
 * Single-pass high-pass: inline separable-ish box/gaussian neighbourhood,
 * then mid-grey + (center - blur). Avoids a second texture so the 2-FBO
 * spatial stage can keep the tone result intact.
 */
export const HIGH_PASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_sigma;

void main() {
  vec4 center = texture(u_image, v_uv);
  if (center.a <= 0.0) {
    outColor = center;
    return;
  }
  int radius = int(floor(u_radius));
  if (radius < 1) {
    outColor = vec4(vec3(0.5), center.a);
    return;
  }
  vec4 sum = center;
  float weightSum = 1.0;
  for (int i = 1; i <= 32; i++) {
    if (i > radius) break;
    float w = exp(-0.5 * float(i * i) / (u_sigma * u_sigma));
    vec2 ox = vec2(u_texel.x * float(i), 0.0);
    vec2 oy = vec2(0.0, u_texel.y * float(i));
    sum += texture(u_image, v_uv + ox) * w;
    sum += texture(u_image, v_uv - ox) * w;
    sum += texture(u_image, v_uv + oy) * w;
    sum += texture(u_image, v_uv - oy) * w;
    weightSum += 4.0 * w;
  }
  vec3 blur = (sum / weightSum).rgb;
  outColor = vec4(clamp(vec3(0.5) + (center.rgb - blur), 0.0, 1.0), center.a);
}`;

/**
 * Single-pass clarity: same neighbourhood blur as high-pass, then
 * center + residual * strength * midtoneWeight.
 */
export const CLARITY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_sigma;
uniform float u_strength;

void main() {
  vec4 center = texture(u_image, v_uv);
  if (center.a <= 0.0) {
    outColor = center;
    return;
  }
  int radius = int(floor(u_radius));
  vec3 blur = center.rgb;
  if (radius >= 1) {
    vec4 sum = center;
    float weightSum = 1.0;
    for (int i = 1; i <= 32; i++) {
      if (i > radius) break;
      float w = exp(-0.5 * float(i * i) / (u_sigma * u_sigma));
      vec2 ox = vec2(u_texel.x * float(i), 0.0);
      vec2 oy = vec2(0.0, u_texel.y * float(i));
      sum += texture(u_image, v_uv + ox) * w;
      sum += texture(u_image, v_uv - ox) * w;
      sum += texture(u_image, v_uv + oy) * w;
      sum += texture(u_image, v_uv - oy) * w;
      weightSum += 4.0 * w;
    }
    blur = (sum / weightSum).rgb;
  }
  float luma = dot(center.rgb, vec3(0.299, 0.587, 0.114));
  float mid = 2.0 * luma - 1.0;
  float weight = 1.0 - mid * mid;
  vec3 residual = center.rgb - blur;
  outColor = vec4(clamp(center.rgb + residual * u_strength * weight, 0.0, 1.0), center.a);
}`;

/**
 * Directional motion blur along u_direction for ±u_radius taps.
 */
export const MOTION_BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform float u_radius;

void main() {
  vec4 center = texture(u_image, v_uv);
  if (center.a <= 0.0) {
    outColor = center;
    return;
  }
  int radius = int(floor(u_radius));
  if (radius < 1) {
    outColor = center;
    return;
  }
  vec3 sum = center.rgb;
  float count = 1.0;
  for (int i = 1; i <= 32; i++) {
    if (i > radius) break;
    vec2 offset = u_direction * u_texel * float(i);
    sum += texture(u_image, clamp(v_uv + offset, vec2(0.0), vec2(1.0))).rgb;
    sum += texture(u_image, clamp(v_uv - offset, vec2(0.0), vec2(1.0))).rgb;
    count += 2.0;
  }
  outColor = vec4(sum / count, center.a);
}`;

