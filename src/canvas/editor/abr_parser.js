/**
 * Photoshop .ABR (Adobe Brush Resource) Parser & Stamp Extractor
 * Supports:
 * - ABR version 1 & 2 (sampled brushes)
 * - ABR version 6+ (8BIM / phr8 / samp brush format)
 * - Raw 8-bit grayscale alpha masks
 * - RLE (PackBits) compressed alpha masks
 */

export function parseABR(arrayBuffer) {
  // Anything shorter than the version header is not an ABR file at all.
  if (!arrayBuffer || arrayBuffer.byteLength < 2) return [];
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;

  const version = view.getInt16(offset);
  offset += 2;

  const brushes = [];

  try {
    if (version === 1 || version === 2) {
      // The sub-version advances the offset; its value is not used downstream.
      void view.getInt16(offset);
      offset += 2;
      const count = view.getInt16(offset);
      offset += 2;

      for (let i = 0; i < count && offset < bytes.length; i++) {
        const type = view.getInt16(offset);
        offset += 2;
        const size = view.getInt32(offset);
        offset += 4;
        const nextOffset = offset + size;

        if (type === 1) {
          // Computed brush (size, hardness, angle, spacing, roundness)
          offset += 2; // misc
          const spacing = view.getInt16(offset);
          offset += 2;
          const diameter = view.getInt16(offset);
          offset += 2;
          const roundness = view.getInt16(offset);
          offset += 2;
          const angle = view.getInt16(offset);
          offset += 2;
          const hardness = view.getInt16(offset);
          offset += 2;

          brushes.push({
            name: `Round Brush ${diameter}px`,
            diameter,
            hardness: hardness / 100,
            spacing: spacing / 100,
            roundness: roundness / 100,
            angle,
          });
        } else if (type === 2) {
          // Sampled brush (bitmap)
          offset += 2; // misc
          const spacing = view.getInt16(offset);
          offset += 2;
          offset += 2; // anti-alias
          const top = view.getInt16(offset);
          offset += 2;
          const left = view.getInt16(offset);
          offset += 2;
          const bottom = view.getInt16(offset);
          offset += 2;
          const right = view.getInt16(offset);
          offset += 2;

          const w = right - left;
          const h = bottom - top;

          if (w > 0 && h > 0 && w < 4096 && h < 4096) {
            // Depth is read to advance the offset; the decoder assumes 8-bit.
            void view.getInt16(offset);
            offset += 2;
            const compression = bytes[offset++]; // 0: raw, 1: RLE

            let alphaData;
            if (compression === 0) {
              alphaData = bytes.slice(offset, offset + w * h);
              offset += w * h;
            } else {
              // RLE decode
              alphaData = decodePackBits(bytes, offset, w, h);
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            const imgData = ctx.createImageData(w, h);
            for (let j = 0; j < w * h; j++) {
              const alpha = alphaData ? alphaData[j] : 255;
              imgData.data[j * 4] = 0;
              imgData.data[j * 4 + 1] = 0;
              imgData.data[j * 4 + 2] = 0;
              imgData.data[j * 4 + 3] = alpha;
            }
            ctx.putImageData(imgData, 0, 0);

            brushes.push({
              name: `Sampled Brush ${w}x${h}`,
              diameter: Math.max(w, h),
              width: w,
              height: h,
              spacing: spacing / 100,
              dataUrl: canvas.toDataURL("image/png"),
            });
          }
        }
        offset = nextOffset;
      }
    } else if (version >= 6) {
      // Modern 8BIM / phr8 / samp block format
      // Search for '8BIM' markers
      let ptr = 0;
      while (ptr < bytes.length - 8) {
        if (
          bytes[ptr] === 0x38 && // '8'
          bytes[ptr + 1] === 0x42 && // 'B'
          bytes[ptr + 2] === 0x49 && // 'I'
          bytes[ptr + 3] === 0x4d // 'M'
        ) {
          ptr += 4;
          // Key (e.g. 'samp', 'desc', 'patt')
          const key = String.fromCharCode(
            bytes[ptr],
            bytes[ptr + 1],
            bytes[ptr + 2],
            bytes[ptr + 3],
          );
          ptr += 4;
          // Length
          const len = view.getInt32(ptr);
          ptr += 4;

          if (key === "samp" && len > 0) {
            // Extract sampled brush
            const stampCanvas = parseSampBlock(bytes.slice(ptr, ptr + len));
            if (stampCanvas) {
              brushes.push({
                name: `Custom Brush ${stampCanvas.width}px`,
                diameter: Math.max(stampCanvas.width, stampCanvas.height),
                width: stampCanvas.width,
                height: stampCanvas.height,
                dataUrl: stampCanvas.toDataURL("image/png"),
              });
            }
          }
          ptr += len;
          if (len % 2 !== 0) ptr += 1;
        } else {
          ptr++;
        }
      }
    }
  } catch (err) {
    console.warn("ABR parsing partial:", err);
  }

  return brushes;
}

function decodePackBits(bytes, offset, w, h) {
  const total = w * h;
  const out = new Uint8Array(total);
  let outPtr = 0;
  let inPtr = offset + h * 2; // skip row lengths table

  while (outPtr < total && inPtr < bytes.length) {
    const header = bytes[inPtr++];
    if (header > 128) {
      const count = 256 - header + 1;
      const val = bytes[inPtr++];
      for (let i = 0; i < count && outPtr < total; i++) {
        out[outPtr++] = val;
      }
    } else if (header < 128) {
      const count = header + 1;
      for (let i = 0; i < count && outPtr < total; i++) {
        out[outPtr++] = bytes[inPtr++];
      }
    }
  }
  return out;
}

function parseSampBlock(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Bounds: top, left, bottom, right
    const top = view.getInt32(0);
    const left = view.getInt32(4);
    const bottom = view.getInt32(8);
    const right = view.getInt32(12);
    // Depth is read to advance the offset; the decoder assumes 8-bit.
    void view.getInt16(16);
    const compression = bytes[18];

    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return null;

    let alphaData;
    if (compression === 0) {
      alphaData = bytes.slice(19, 19 + w * h);
    } else {
      alphaData = decodePackBits(bytes, 19, w, h);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const alpha = alphaData[i] || 0;
      imgData.data[i * 4] = 0;
      imgData.data[i * 4 + 1] = 0;
      imgData.data[i * 4 + 2] = 0;
      imgData.data[i * 4 + 3] = alpha;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
