export function mixedNativeText() {
  const bytes = [];
  const view = new DataView(new ArrayBuffer(4));
  for (const [command, ...values] of [[0], [1, 0, 0], [2, 0.5, 1], [2, 1, 0], [0]]) {
    bytes.push(command);
    for (const value of values) {
      view.setFloat32(0, value, true);
      bytes.push(...new Uint8Array(view.buffer));
    }
  }
  const guid = localID => ({ sessionID: 0, localID });
  return {
    blobs: [{ bytes: Uint8Array.from(bytes) }],
    nodeChanges: [
      { guid: guid(0), type: "DOCUMENT", name: "Document" },
      { guid: guid(1), type: "TEXT", name: "Mixed sizes", parentIndex: { guid: guid(0), position: "!" },
        transform: { m00: 1, m01: 0, m10: 0, m11: 1, m02: 0, m12: 0 }, size: { x: 258, y: 126 },
        fontSize: 64, fontName: { family: "Unavailable Test Face", style: "Regular", postscript: "" },
        lineHeight: { value: 1.2, units: "RAW" }, textAutoResize: "WIDTH_AND_HEIGHT",
        fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
        textData: { characters: "A\nB", characterStyleIDs: [5, 5, 0], styleOverrideTable: [{ styleID: 5, fontSize: 36 }] },
        derivedTextData: { layoutSize: { x: 258, y: 126 }, glyphs: [
          { commandsBlob: 0, firstCharacter: 0, fontSize: 36, position: { x: 0, y: 36 }, advance: 1, rotation: 0 },
          { commandsBlob: 0, firstCharacter: 2, fontSize: 64, position: { x: 0, y: 112 }, advance: 1, rotation: 0 },
        ] },
      },
    ],
  };
}
