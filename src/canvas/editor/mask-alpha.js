/** Convert straight-alpha luminance to coverage with one consistent rounding rule. */
export function luminanceToAlpha(data) {
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.2125 * data[i] + 0.7154 * data[i + 1] + 0.0721 * data[i + 2];
    data[i + 3] = Math.round((luminance * data[i + 3]) / 255);
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
  }
}
