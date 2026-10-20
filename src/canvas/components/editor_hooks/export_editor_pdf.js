import { bytesToDataUrl } from "../../../shared/media-export.js";

const encoder = new TextEncoder();

function joinBytes(chunks) {
  const output = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Read the dimensions recorded by the JPEG encoder itself. */
function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("EXPORT_DATA_INVALID");
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset] !== 0xff) throw new Error("EXPORT_DATA_INVALID");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw new Error("EXPORT_DATA_INVALID");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 7) throw new Error("EXPORT_DATA_INVALID");
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!width || !height) throw new Error("EXPORT_DATA_INVALID");
      return { width, height };
    }
    offset += length;
  }
  throw new Error("EXPORT_DATA_INVALID");
}

async function deflateBytes(bytes) {
  if (typeof globalThis.CompressionStream !== "function") {
    throw new Error("COMPRESSION_STREAM_UNAVAILABLE");
  }
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const response = new Response(cs.readable);
  return new Uint8Array(await response.arrayBuffer());
}

async function decodeImageToImageData(dataUrl) {
  let bitmap = null;
  if (typeof globalThis.createImageBitmap === "function") {
    let source = dataUrl;
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
      const res = await fetch(dataUrl);
      source = await res.blob();
    }
    bitmap = await globalThis.createImageBitmap(source);
  } else if (typeof Image !== "undefined") {
    const img = new Image();
    img.src = dataUrl;
    await img.decode?.();
    bitmap = img;
  }
  if (!bitmap) throw new Error("EXPORT_DATA_INVALID");
  const width = bitmap.width ?? bitmap.naturalWidth;
  const height = bitmap.height ?? bitmap.naturalHeight;
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : typeof document !== "undefined" && typeof document.createElement === "function"
        ? document.createElement("canvas")
        : null;
  if (!canvas) throw new Error("CANVAS_UNAVAILABLE");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  ctx.drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === "function") bitmap.close();
  return {
    width,
    height,
    imageData: ctx.getImageData(0, 0, width, height),
  };
}

async function rgbaPageToPdf({ dataUrl, width, height }) {
  const { width: pixelWidth, height: pixelHeight, imageData } =
    await decodeImageToImageData(dataUrl);
  const totalPixels = pixelWidth * pixelHeight;
  const rgb = new Uint8Array(totalPixels * 3);
  const alpha = new Uint8Array(totalPixels);
  let hasAlpha = false;

  const data = imageData.data;
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    rgb[j * 3] = data[i];
    rgb[j * 3 + 1] = data[i + 1];
    rgb[j * 3 + 2] = data[i + 2];
    const a = data[i + 3];
    alpha[j] = a;
    if (a < 255) hasAlpha = true;
  }

  const rgbStream = await deflateBytes(rgb);
  const alphaStream = hasAlpha ? await deflateBytes(alpha) : null;

  const pageWidth = Number((width * 0.75).toFixed(2));
  const pageHeight = Number((height * 0.75).toFixed(2));
  const content = encoder.encode(
    `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`,
  );
  const chunks = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let position = chunks[0].length;
  const append = (...parts) => {
    for (const part of parts) {
      const bytes = typeof part === "string" ? encoder.encode(part) : part;
      chunks.push(bytes);
      position += bytes.length;
    }
  };
  const object = (id, ...parts) => {
    offsets[id] = position;
    append(`${id} 0 obj\n`, ...parts, "\nendobj\n");
  };

  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );

  const smaskEntry = hasAlpha ? " /SMask 6 0 R" : "";
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smaskEntry} /Length ${rgbStream.length} >>\nstream\n`,
    rgbStream,
    "\nendstream",
  );
  object(5, `<< /Length ${content.length} >>\nstream\n`, content, "endstream");

  const totalObjs = hasAlpha ? 6 : 5;
  if (hasAlpha) {
    object(
      6,
      `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alphaStream.length} >>\nstream\n`,
      alphaStream,
      "\nendstream",
    );
  }

  const xref = position;
  append(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjs; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return bytesToDataUrl(joinBytes(chunks), "application/pdf");
}

function buildJpegPdf({ jpegBytes, width, height }) {
  const image = jpegDimensions(jpegBytes);
  const pageWidth = Number((width * 0.75).toFixed(2));
  const pageHeight = Number((height * 0.75).toFixed(2));
  const content = encoder.encode(
    `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`,
  );
  const chunks = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let position = chunks[0].length;
  const append = (...parts) => {
    for (const part of parts) {
      const bytes = typeof part === "string" ? encoder.encode(part) : part;
      chunks.push(bytes);
      position += bytes.length;
    }
  };
  const object = (id, ...parts) => {
    offsets[id] = position;
    append(`${id} 0 obj\n`, ...parts, "\nendobj\n");
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    jpegBytes,
    "\nendstream",
  );
  object(5, `<< /Length ${content.length} >>\nstream\n`, content, "endstream");
  const xref = position;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return bytesToDataUrl(joinBytes(chunks), "application/pdf");
}

/** Package the page's render as a single PDF image object. */
export async function jpegPageToPdf({ dataUrl, width, height }) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("EXPORT_DOCUMENT_INVALID");
  }

  const jpegMatch = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl ?? "",
  );
  if (jpegMatch) {
    const jpeg = Uint8Array.from(atob(jpegMatch[1]), (character) =>
      character.charCodeAt(0),
    );
    return buildJpegPdf({ jpegBytes: jpeg, width, height });
  }

  return rgbaPageToPdf({ dataUrl, width, height });
}
