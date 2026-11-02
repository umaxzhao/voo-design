const encoder = new TextEncoder();

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("Presentation export aborted", "AbortError");
  }
}

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

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("EXPORT_DATA_INVALID");
  }
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset] !== 0xff) throw new Error("EXPORT_DATA_INVALID");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) {
      throw new Error("EXPORT_DATA_INVALID");
    }
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
  if (typeof globalThis.CompressionStream === "function") {
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const response = new Response(cs.readable);
    return new Uint8Array(await response.arrayBuffer());
  }
  try {
    const { deflateSync } = await import("node:zlib");
    return new Uint8Array(deflateSync(bytes));
  } catch {
    throw new Error("COMPRESSION_UNAVAILABLE");
  }
}

/** Build a multi-page PDF presentation deck from rendered slide assets. */
export async function buildPresentationPdf(
  deck,
  { renderPage, signal } = {},
) {
  if (!deck || !Array.isArray(deck.pages) || deck.pages.length === 0) {
    throw new TypeError("Presentation must contain at least one page");
  }
  if (
    !Number.isFinite(deck.width) ||
    !Number.isFinite(deck.height) ||
    deck.width <= 0 ||
    deck.height <= 0
  ) {
    throw new TypeError("Presentation dimensions must be positive numbers");
  }
  if (typeof renderPage !== "function") {
    throw new TypeError("renderPage function is required for presentation PDF export");
  }

  const ids = new Set();
  for (const page of deck.pages) {
    if (!page || typeof page.id !== "string" || !page.id || ids.has(page.id)) {
      throw new TypeError("Presentation pages require unique IDs");
    }
    ids.add(page.id);
  }

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

  // Pre-allocate object IDs:
  // 1: Catalog
  // 2: Pages
  // For each page index i (0..N-1):
  //   pageObjId: 3 + i * 3
  //   contentObjId: 3 + i * 3 + 1
  //   imageObjId: 3 + i * 3 + 2
  const pageCount = deck.pages.length;
  const pageObjIds = [];
  for (let i = 0; i < pageCount; i += 1) {
    pageObjIds.push(3 + i * 3);
  }

  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );

  const warnings = [];

  for (let i = 0; i < pageCount; i += 1) {
    throwIfAborted(signal);
    const page = deck.pages[i];
    const rendered = await renderPage(page);
    throwIfAborted(signal);

    const pageObjId = 3 + i * 3;
    const contentObjId = 3 + i * 3 + 1;
    const imageObjId = 3 + i * 3 + 2;

    const width = rendered?.width ?? deck.width;
    const height = rendered?.height ?? deck.height;
    // 72 pt/inch at 96 dpi => 0.75
    const pageWidth = Number((width * 0.75).toFixed(2));
    const pageHeight = Number((height * 0.75).toFixed(2));

    const content = encoder.encode(
      `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`,
    );

    object(
      pageObjId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>`,
    );

    const bytes = rendered.bytes;
    const isJpeg =
      rendered.mimeType === "image/jpeg" ||
      (bytes && bytes[0] === 0xff && bytes[1] === 0xd8);

    if (isJpeg) {
      let dims;
      try {
        dims = jpegDimensions(bytes);
      } catch {
        dims = { width, height };
      }
      object(
        imageObjId,
        `<< /Type /XObject /Subtype /Image /Width ${dims.width} /Height ${dims.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
        bytes,
        "\nendstream",
      );
    } else {
      // FlateDecode PNG or uncompressed RGB
      const deflated = await deflateBytes(bytes);
      object(
        imageObjId,
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`,
        deflated,
        "\nendstream",
      );
    }

    object(
      contentObjId,
      `<< /Length ${content.length} >>\nstream\n`,
      content,
      "endstream",
    );
  }

  const totalObjs = 2 + pageCount * 3;
  const xref = position;
  append(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjs; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  return {
    blob: new Blob([joinBytes(chunks)], { type: "application/pdf" }),
    warnings,
  };
}
