import { describe, expect, it } from "vitest";
import AiRepairDownloadDialog from "../../src/canvas/components/ai_repair_download_dialog.jsx";

describe("AiRepairDownloadDialog module", () => {
  it("exports the dialog component as its default export", () => {
    expect(typeof AiRepairDownloadDialog).toBe("function");
  });
});
