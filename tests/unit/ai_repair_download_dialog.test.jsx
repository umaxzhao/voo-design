import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AiRepairDownloadDialog from "../../src/canvas/components/ai_repair_download_dialog.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: key => key }) }));

describe("AiRepairDownloadDialog module", () => {
  it("exports the dialog component as its default export", () => {
    expect(typeof AiRepairDownloadDialog).toBe("function");
  });
  it.each(["downloading", "running"])("keeps Cancel available during %s", phase => {
    const html = renderToStaticMarkup(<AiRepairDownloadDialog state={{ phase }}
      onCancel={() => {}} onDownload={() => {}} />);
    expect(html).toContain("editor.cancel");
    expect(html).not.toContain('disabled=""');
  });
});
