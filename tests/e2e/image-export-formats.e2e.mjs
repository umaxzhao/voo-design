import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPsd } from "ag-psd";
import { inflateSync } from "node:zlib";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page
}) => {
  const audit = imageAudit(page, "export-formats");
  for (const [format, label] of [["png", "PNG"], ["jpeg", "JPEG"], ["webp", "WebP"], ["svg", "SVG"], ["psd", "PSD"], ["pdf", "PDF"]]) {
    await audit.record(format, async () => {
      const node = await audit.seed();
      await page.keyboard.press("Control+k");
      const palette = page.getByRole("dialog").filter({
        has: page.getByRole("combobox")
      });
      await palette.getByRole("combobox").waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const ids = await palette.getByRole("option").evaluateAll(elements => elements.map(element => element.id));
      assert.equal(new Set(ids).size, ids.length, "Recent commands must not duplicate rows or keyboard IDs");
      await palette.getByRole("combobox").fill("Export");
      await palette.getByRole("option").filter({
        hasText: /^Export$/
      }).click();
      const dialog = page.getByTestId("design-export-dialog");
      await dialog.getByRole("button", {
        name: new RegExp(`^${label}(?: |$)`)
      }).click();
      const one = dialog.getByRole("button", {
        name: /^1[x×]$/
      });
      if (await one.count()) await one.click();
      const ready = page.waitForEvent("download");
      await dialog.getByRole("button", {
        name: "Export",
        exact: true
      }).click();
      const download = await ready;
      const bytes = await readFile(await download.path());
      assert.ok(bytes.length > 100);
      if (format === "psd") {
        assert.equal(bytes.subarray(0, 4).toString(), "8BPS");
        const psd = readPsd(bytes, {
          skipLayerImageData: true,
          skipCompositeImageData: true
        });
        assert.equal(psd.width, 600);
        assert.equal(psd.height, 400);
        assert.ok(psd.children?.length > 0, "PSD must retain actual layer records");
      } else if (format === "pdf") {
        assert.match(bytes.subarray(0, 10).toString(), /^%PDF-/);
        const text = bytes.toString("latin1");
        const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
        assert.deepEqual(box?.slice(1).map(Number), [450, 300], "PDF uses 72pt/in for the editor's 96px/in page");
        const embedded = /\/Subtype \/Image \/Width 600 \/Height 400 \/ColorSpace \/DeviceRGB[^]*?\/Length (\d+) >>\nstream\n/.exec(text);
        assert.ok(embedded, "PDF must contain the rendered RGB image");
        const start = embedded.index + embedded[0].length;
        const rgb = inflateSync(bytes.subarray(start, start + Number(embedded[1])));
        const offset = ((node.y + 45) * 600 + node.x + 10) * 3;
        assert.deepEqual([...rgb.subarray(offset, offset + 3)], [255, 0, 0]);
      } else {
        const pixel = await page.evaluate(async ({
          data,
          format,
          node
        }) => {
          const image = new Image();
          image.src = `data:image/${format === "svg" ? "svg+xml" : format};base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return {
            width: image.width,
            height: image.height,
            rgba: [...context.getImageData(node.x + 10, node.y + 45, 1, 1).data]
          };
        }, {
          data: bytes.toString("base64"),
          format,
          node
        });
        assert.equal(pixel.width, 600);
        assert.equal(pixel.height, 400);
        assert.ok(pixel.rgba[0] > 220 && pixel.rgba[1] < 40 && pixel.rgba[2] < 40 && pixel.rgba[3] > 240, "The downloaded file must contain the source image's actual red pixels");
      }
      if (await dialog.count()) await dialog.getByRole("button", {
        name: "Cancel",
        exact: true
      }).click();
      return {
        actualExportDialog: true,
        downloadedBytes: bytes.length,
        decoded: true,
        filename: download.suggestedFilename()
      };
    });
  }
  audit.finish();
});
