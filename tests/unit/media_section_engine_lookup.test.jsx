/**
 * MediaSection reads the live node back through the engine before patching
 * media fields. `engine.getDocument()` may be null mid-teardown, so the lookup
 * must be optional-chained all the way (`getDocument()?.nodes?.find`) instead
 * of throwing a TypeError on a null document.
 */

import { describe, it, expect, vi } from "vitest";

// MediaSection (and its child field) uses hooks; the test calls the component
// as a plain function to reach the field handlers, so hooks need a per-call
// stub that a real renderer would otherwise provide.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useState: (initial) => [
      typeof initial === "function" ? initial() : initial,
      () => {},
    ],
    useEffect: () => {},
  };
});

import MediaSection from "../../src/canvas/components/editor_properties/media_section.jsx";

const t = (key) => key;
const noop = () => {};

// Shallow-walk the element tree, expanding function components (hooks are
// stubbed in this suite) so the NumberField handlers become reachable.
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (typeof node.type === "string") {
    walk(node.props?.children, visit);
    return;
  }
  if (typeof node.type === "function") {
    // A NumberField element: numeric range plus a change handler.
    if (
      typeof node.props?.onChange === "function" &&
      typeof node.props?.min === "number"
    ) {
      visit(node);
    }
    walk(node.type(node.props), visit);
  }
}

function collectInputs(root) {
  const out = [];
  walk(root, (node) => out.push(node));
  return out;
}

function videoSectionProps(extra) {
  return {
    object: { id: "v1", kind: "video", media: { inPoint: 0, outPoint: 4, speed: 1 } },
    edit: noop,
    editAndCommit: noop,
    t,
    ...extra,
  };
}

describe("MediaSection engine lookup", () => {
  it("renders without touching the engine document", () => {
    expect(() =>
      MediaSection(videoSectionProps({ engine: { getDocument: () => null } }))
    ).not.toThrow();
  });

  it("reports an unavailable clip instead of a TypeError when the document is null", () => {
    const element = MediaSection(
      videoSectionProps({ engine: { getDocument: () => null } })
    );
    const [inPointField] = collectInputs(element);
    expect(inPointField).toBeTruthy();
    expect(() => inPointField.props.onChange(1.5)).toThrow(
      /Selected video clip is unavailable/
    );
  });

  it("reports an unavailable clip when the document has no nodes array", () => {
    const element = MediaSection(
      videoSectionProps({ engine: { getDocument: () => ({}) } })
    );
    const [inPointField] = collectInputs(element);
    expect(() => inPointField.props.onChange(1.5)).toThrow(
      /Selected video clip is unavailable/
    );
  });

  it("patches media from the live node the engine returns", () => {
    const edit = vi.fn();
    const element = MediaSection(
      videoSectionProps({
        engine: {
          getDocument: () => ({
            nodes: [{ id: "v1", kind: "video", media: { inPoint: 0, outPoint: 4 } }],
          }),
        },
        edit,
      })
    );
    const [inPointField] = collectInputs(element);
    inPointField.props.onChange(1.5);
    expect(edit).toHaveBeenCalledWith({
      media: { inPoint: 1.5, outPoint: 4 },
    });
  });
});
