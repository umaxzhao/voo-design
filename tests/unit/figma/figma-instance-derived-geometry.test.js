import { expect, it } from "vitest";
import { expandInstances } from "../../../src/canvas/figma/figma-instances.js";

it("applies derived child fill and stroke geometry without mutating the master", () => {
  const guid = localID => ({ sessionID: 1, localID });
  const master = { guid: guid(1), type: "COMPONENT" };
  const child = { guid: guid(2), parentIndex: { guid: master.guid }, type: "RECTANGLE", fillGeometry: "master" };
  const instance = { guid: guid(3), type: "INSTANCE", symbolData: { symbolID: master.guid },
    derivedSymbolData: [{ guidPath: { guids: [child.guid] }, fillGeometry: "derived-fill", strokeGeometry: "derived-stroke" }] };
  const expanded = expandInstances([master, child, instance]);
  const copy = expanded.find(node => node.parentIndex?.guid.localID === 3);
  expect(copy.fillGeometry).toBe("derived-fill");
  expect(copy.strokeGeometry).toBe("derived-stroke");
  expect(child.fillGeometry).toBe("master");
});
