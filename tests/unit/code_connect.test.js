import { describe, expect, it } from "vitest";
import {
  normalizeCodeConnect,
  resolveCodeSnippet,
} from "../../src/canvas/codegen/code_connect.js";

describe("Code Connect Model and Snippet Generator", () => {
  it("normalizes codeConnect mappings", () => {
    expect(normalizeCodeConnect(null)).toBeNull();
    expect(normalizeCodeConnect({})).toBeNull();

    const normalized = normalizeCodeConnect({
      componentName: "PrimaryButton",
      importPath: "@/components/Button",
      template: "<PrimaryButton variant=\"{variant}\">{label}</PrimaryButton>",
    });
    expect(normalized).toBeDefined();
    expect(normalized.componentName).toBe("PrimaryButton");
    expect(normalized.importPath).toBe("@/components/Button");
    expect(normalized.template).toContain("variant=\"{variant}\"");
  });

  it("resolves code snippet with template and instance properties", () => {
    const compDoc = {
      canvasId: "btn-master",
      codeConnect: {
        componentName: "Button",
        importPath: "@/components/ui/button",
        template: "<Button variant=\"{variant}\" size=\"{size}\">{label}</Button>",
      },
    };

    const instanceNode = {
      id: "inst1",
      kind: "canvasInstance",
      sourceCanvasId: "btn-master",
      componentProperties: {
        variant: "outline",
        size: "sm",
        label: "Confirm",
      },
    };

    const snippet = resolveCodeSnippet(instanceNode, compDoc);
    expect(snippet).toBeDefined();
    expect(snippet.componentName).toBe("Button");
    expect(snippet.importStatement).toBe("import { Button } from \"@/components/ui/button\";\n\n");
    expect(snippet.code).toContain("<Button variant=\"outline\" size=\"sm\">Confirm</Button>");
  });

  it("falls back to synthesized props when template is omitted", () => {
    const compDoc = {
      canvasId: "badge-master",
      codeConnect: {
        componentName: "Badge",
        importPath: "@/components/badge",
      },
    };

    const instanceNode = {
      id: "badge1",
      kind: "canvasInstance",
      sourceCanvasId: "badge-master",
      text: "New",
      componentProperties: {
        count: 5,
        active: true,
      },
    };

    const snippet = resolveCodeSnippet(instanceNode, compDoc);
    expect(snippet.code).toContain("<Badge count={5} active>New</Badge>");
  });
});
