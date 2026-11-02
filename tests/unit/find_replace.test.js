import { describe, expect, it } from "vitest";
import {
  buildTextMatcher,
  findTextMatches,
  replaceAll,
  replaceOne,
} from "../../src/canvas/editor/find_replace.js";

function textNode(id, text, extra = {}) {
  return {
    id,
    kind: "text",
    x: 0,
    y: 0,
    width: 120,
    height: 24,
    text,
    fill: "#111111",
    fontSize: 16,
    fontFamily: "Inter",
    fontWeight: "600",
    ...extra,
  };
}

function makeDoc(nodes) {
  return { width: 800, height: 600, backgroundColor: "#ffffff", nodes };
}

describe("findTextMatches", () => {
  it("returns matches in paint order (document node order)", () => {
    const doc = makeDoc([
      textNode("t1", "Hello world"),
      { id: "shape", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
      textNode("t2", "hello HELLO"),
      textNode("t3", "nothing here"),
    ]);
    const matches = findTextMatches(doc, { query: "hello" });
    expect(matches).toEqual([
      { nodeId: "t1", start: 0, end: 5, text: "Hello", matchIndex: 0 },
      { nodeId: "t2", start: 0, end: 5, text: "hello", matchIndex: 1 },
      { nodeId: "t2", start: 6, end: 11, text: "HELLO", matchIndex: 2 },
    ]);
  });

  it("honours case sensitivity", () => {
    const doc = makeDoc([textNode("t1", "Hello hello")]);
    expect(findTextMatches(doc, { query: "hello", caseSensitive: true })).toEqual([
      { nodeId: "t1", start: 6, end: 11, text: "hello", matchIndex: 0 },
    ]);
    expect(findTextMatches(doc, { query: "HELLO", caseSensitive: true })).toEqual([]);
  });

  it("requires whole words when enabled, including CJK boundaries", () => {
    const doc = makeDoc([
      textNode("latin", "cat concatenate cat. (cat) cat_1"),
      textNode("cjk", "设计 设计稿 稿设计 设计，"),
    ]);
    const latin = findTextMatches(doc, { query: "cat", wholeWord: true });
    expect(latin.map((match) => match.text)).toEqual(["cat", "cat", "cat"]);
    expect(latin.map((match) => match.start)).toEqual([0, 16, 22]);

    const loose = findTextMatches(doc, { query: "设计" });
    expect(loose).toHaveLength(4);
    const strict = findTextMatches(doc, { query: "设计", wholeWord: true });
    // Standalone "设计" and "设计，" match; the suffixed/prefixed compounds do not.
    expect(strict).toHaveLength(2);
    expect(strict.every((match) => match.nodeId === "cjk")).toBe(true);
  });

  it("treats punctuation-only queries literally even with wholeWord", () => {
    const doc = makeDoc([textNode("t1", "a--b -- c")]);
    const matches = findTextMatches(doc, { query: "--", wholeWord: true });
    expect(matches.map((match) => match.start)).toEqual([1, 5]);
  });

  it("returns nothing for an empty query or a document without text nodes", () => {
    expect(findTextMatches(makeDoc([textNode("t1", "abc")]), { query: "" })).toEqual([]);
    expect(findTextMatches(makeDoc([]), { query: "a" })).toEqual([]);
    expect(findTextMatches(null, { query: "a" })).toEqual([]);
    expect(
      findTextMatches(
        makeDoc([
          { id: "r", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
          { id: "t", kind: "text" },
        ]),
        { query: "a" },
      ),
    ).toEqual([]);
  });

  it("builds a matcher that reports no match for invalid queries", () => {
    expect(buildTextMatcher({ query: "" })).toBeNull();
    expect(buildTextMatcher({ query: "a".repeat(5000) })).toBeNull();
  });
});

describe("replaceOne", () => {
  it("rewrites only the matched range and preserves node styling", () => {
    const doc = makeDoc([
      textNode("t1", "Alpha beta", { fontSize: 32, fill: "#ff0000" }),
      textNode("t2", "beta"),
    ]);
    const [match] = findTextMatches(doc, { query: "beta" });
    const result = replaceOne(doc, match, "gamma");
    expect(result.replaced).toBe(true);
    expect(result.doc).not.toBe(doc);
    expect(result.doc.nodes[0].text).toBe("Alpha gamma");
    expect(result.doc.nodes[0].fontSize).toBe(32);
    expect(result.doc.nodes[0].fill).toBe("#ff0000");
    // An untouched node keeps its identity.
    expect(result.doc.nodes[1]).toBe(doc.nodes[1]);
  });

  it("is a no-op for a stale or malformed match", () => {
    const doc = makeDoc([textNode("t1", "Alpha")]);
    const stale = { nodeId: "t1", start: 0, end: 5, text: "Omega", matchIndex: 0 };
    expect(replaceOne(doc, stale, "X")).toEqual({ doc, replaced: false });
    expect(
      replaceOne(doc, { nodeId: "missing", start: 0, end: 1, text: "A" }, "X"),
    ).toEqual({ doc, replaced: false });
    expect(replaceOne(doc, null, "X")).toEqual({ doc, replaced: false });
  });

  it("keeps a replacement containing regex replacement syntax literal", () => {
    const doc = makeDoc([textNode("t1", "price")]);
    const [match] = findTextMatches(doc, { query: "price" });
    const result = replaceOne(doc, match, "$& $1");
    expect(result.doc.nodes[0].text).toBe("$& $1");
  });
});

describe("replaceAll", () => {
  it("replaces every occurrence across nodes and counts them", () => {
    const doc = makeDoc([
      textNode("t1", "foo foo"),
      textNode("t2", "FOO"),
      { id: "r", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const result = replaceAll(
      doc,
      { query: "foo" },
      "bar",
    );
    expect(result.count).toBe(3);
    expect(result.doc.nodes[0].text).toBe("bar bar");
    expect(result.doc.nodes[1].text).toBe("bar");
    expect(result.doc.nodes[2]).toBe(doc.nodes[2]);
  });

  it("applies each node's matches from the end so offsets stay valid", () => {
    const doc = makeDoc([textNode("t1", "ab ab ab")]);
    const result = replaceAll(doc, { query: "ab" }, "xyz");
    expect(result.count).toBe(3);
    expect(result.doc.nodes[0].text).toBe("xyz xyz xyz");
  });

  it("respects case sensitivity and whole-word options", () => {
    const caseSensitive = replaceAll(
      makeDoc([textNode("t1", "cat Cat")]),
      { query: "cat", caseSensitive: true },
      "dog",
    );
    expect(caseSensitive.count).toBe(1);
    expect(caseSensitive.doc.nodes[0].text).toBe("dog Cat");

    const wholeWord = replaceAll(
      makeDoc([textNode("t1", "cat Cat concatenate")]),
      { query: "cat", wholeWord: true },
      "dog",
    );
    expect(wholeWord.count).toBe(2);
    expect(wholeWord.doc.nodes[0].text).toBe("dog dog concatenate");
  });

  it("returns the same document for an empty query or no matches", () => {
    const doc = makeDoc([textNode("t1", "hello")]);
    expect(replaceAll(doc, { query: "" }, "x")).toEqual({ doc, count: 0 });
    expect(replaceAll(doc, { query: "zzz" }, "x")).toEqual({ doc, count: 0 });
  });

  it("does not create a new document when the text is unchanged", () => {
    const doc = makeDoc([textNode("t1", "same")]);
    const result = replaceAll(doc, { query: "same" }, "same");
    expect(result.count).toBe(1);
    expect(result.doc).toBe(doc);
  });
});
