/**
 * The gain envelope a desktop film's sound follows.
 *
 * The editor auditions a fade with `audioGainAt`, and the browser export
 * applies it to its gain node; the desktop Remotion bundle gets no fades for
 * free, so it interpolates the same envelope between frames.
 */

/**
 * The layer's gain (layer level × fade shape; muted = 0 always) —
 * `audioGainFrames(media, fps, spanFrames)` returns a callback that
 * interpolates the envelope across a sequence `spanFrames` long.
 *
 * @param {object} media                     a clip's media strings
 * @param {number} fps                       composition frame rate
 * @param {number} spanFrames                the sequence's own length in frames
 * @returns {(frame: number) => number} 0..1
 */
export function audioGainFrames(media, fps, spanFrames) {
  if (media?.muted) return () => 0;
  const level = Math.min(1, Math.max(0, Number(media?.volume ?? 1)));
  const fadeIn = Math.max(0, Number(media?.fadeIn ?? 0) * fps);
  const fadeOut = Math.max(0, Number(media?.fadeOut ?? 0) * fps);
  return (frame) => {
    let gain = 1;
    if (fadeIn > 0) gain = Math.min(gain, Math.max(0, frame) / fadeIn);
    const fromEnd = spanFrames - frame;
    if (fadeOut > 0) gain = Math.min(gain, Math.max(0, fromEnd) / fadeOut);
    return Math.min(1, Math.max(0, level * gain));
  };
}
