function concatBytes(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
export function createRasterPdf(jpeg, imageWidth, imageHeight, pageWidth = imageWidth, pageHeight = imageHeight) {
    if (jpeg.length === 0)
        throw new Error("PDF export requires JPEG bytes");
    if (imageWidth <= 0 ||
        imageHeight <= 0 ||
        pageWidth <= 0 ||
        pageHeight <= 0) {
        throw new Error("PDF page dimensions must be positive");
    }
    const encoder = new TextEncoder();
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    const objects = [
        encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
        encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
        concatBytes([
            encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
            jpeg,
            encoder.encode("\nendstream"),
        ]),
        encoder.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    ];
    const chunks = [
        encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"),
    ];
    const offsets = [0];
    let byteOffset = chunks[0].length;
    objects.forEach((object, index) => {
        const header = encoder.encode(`${index + 1} 0 obj\n`);
        const footer = encoder.encode("\nendobj\n");
        offsets.push(byteOffset);
        chunks.push(header, object, footer);
        byteOffset += header.length + object.length + footer.length;
    });
    const xrefOffset = byteOffset;
    const entries = offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
        .join("");
    chunks.push(encoder.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
    return concatBytes(chunks);
}
//# sourceMappingURL=raster-pdf.js.map