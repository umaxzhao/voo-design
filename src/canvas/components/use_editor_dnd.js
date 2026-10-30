import { useEffect, useState } from "react";
import { isEditorImageFile } from "./editor_import_files.js";
import { TOOL } from "../editor/editor_constants.js";
import { importEditorImageBatch } from "./editor_image_batch.js";

const WEB_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/bmp",
];

function selectBestImageItem(items) {
  if (!items || items.length === 0) return null;
  for (const type of WEB_IMAGE_TYPES) {
    const match = items.find((item) => item.type === type);
    if (match) return match;
  }
  return items.find((item) => item.type.startsWith("image/")) || null;
}

function selectBestImageFile(files) {
  if (!files || files.length === 0) return null;
  for (const type of WEB_IMAGE_TYPES) {
    const match = files.find((file) => file.type === type);
    if (match) return match;
  }
  return files.find((file) => file.type.startsWith("image/")) || null;
}

import { isSvgString } from "../editor/editor_svg.js";

export function isSvgFile(file) {
  if (!file) return false;
  if (file.type === "image/svg+xml") return true;
  if (
    typeof file.name === "string" &&
    file.name.toLowerCase().endsWith(".svg")
  ) {
    return true;
  }
  return false;
}

function extractSvgFromHtml(html) {
  if (typeof html !== "string") return null;
  const match = /<svg[\s\S]*?<\/svg>/i.exec(html);
  return match ? match[0] : null;
}

function selectAfterInsertIfUnchanged(engine, previousTool) {
  if (!engine || previousTool === undefined) return;
  // Decoding a dropped image is async. Do not override a tool the user chose
  // while the insert was still running.
  if (engine.getTool() === previousTool) engine.setTool(TOOL.SELECT);
}

export function extractPastedImageSource(clipboardData) {
  if (!clipboardData) return null;

  // 1. Check for SVG markup directly in text/plain (e.g. Figma "Copy as SVG", Illustrator, web)
  const text = clipboardData.getData?.("text/plain")?.trim?.() ?? "";
  if (text && isSvgString(text)) {
    return { kind: "svg", data: text };
  }

  // 2. Check HTML for embedded SVG markup
  const html = clipboardData.getData?.("text/html") ?? "";
  if (html) {
    const svgInHtml = extractSvgFromHtml(html);
    if (svgInHtml) return { kind: "svg", data: svgInHtml };
  }

  // 3. Check clipboard items for SVG or image files
  const items = Array.from(clipboardData.items ?? []);
  for (const item of items) {
    if (item.type === "image/svg+xml") {
      const file =
        typeof item.getAsFile === "function" ? item.getAsFile() : item;
      if (file) return { kind: "svg_file", data: file };
    }
  }

  // 4. Check clipboard files for SVG files
  const files = Array.from(clipboardData.files ?? []);
  const svgFile = files.find((file) => isSvgFile(file));
  if (svgFile) return { kind: "svg_file", data: svgFile };

  // 5. Check clipboard items for standard image files (prioritizing web formats)
  const imageItem = selectBestImageItem(items);
  if (imageItem) {
    const file =
      typeof imageItem.getAsFile === "function"
        ? imageItem.getAsFile()
        : imageItem;
    if (file) return { kind: "file", data: file };
  }

  // 6. Check clipboard files for standard image files
  const imageFile = selectBestImageFile(files);
  if (imageFile) return { kind: "file", data: imageFile };

  // 7. Check for pasted image URLs
  if (
    text &&
    (/^https?:\/\/.+\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(text) ||
      text.startsWith("data:image/"))
  ) {
    return { kind: "url", data: text };
  }

  // 8. Check HTML for embedded img tag
  if (html) {
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (
      match &&
      (match[1].startsWith("data:image/") || /^https?:\/\//i.test(match[1]))
    ) {
      return { kind: "url", data: match[1] };
    }
  }

  return null;
}

/**
 * Handles paste and drag-and-drop events for inserting images and vector SVGs into the image editor engine.
 */
export function useEditorDnd({
  nodeId,
  engine,
  onInsertError,
  onOpenVoo,
}) {
  const [fileDragOver, setFileDragOver] = useState(false);

  // The drop overlay must never outlive the drag. A drop can be consumed in
  // the capture phase (media files) or have its bubbling stopped by a child,
  // so the React onDrop below is not guaranteed to run. Watch the window
  // instead: any drop, a cancelled drag, or leaving the window ends it.
  useEffect(() => {
    if (!fileDragOver) return undefined;
    const clear = () => setFileDragOver(false);
    const clearWhenLeavingWindow = (event) => {
      if (!event.relatedTarget) clear();
    };
    window.addEventListener("drop", clear, true);
    window.addEventListener("dragend", clear, true);
    window.addEventListener("dragleave", clearWhenLeavingWindow, true);
    return () => {
      window.removeEventListener("drop", clear, true);
      window.removeEventListener("dragend", clear, true);
      window.removeEventListener("dragleave", clearWhenLeavingWindow, true);
    };
  }, [fileDragOver]);

  // Clipboard paste listener: ⌘V / Ctrl+V pastes SVG vectors or images directly onto canvas.
  useEffect(() => {
    if (!nodeId || !engine) return undefined;

    const handlePaste = (event) => {
      // Don't intercept paste when user is typing in a textarea/input
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      if (engine.paste?.(clipboardData)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const source = extractPastedImageSource(clipboardData);
      if (source) {
        const previousTool = engine.getTool();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const insertAction = async () => {
          if (source.kind === "svg") {
            try {
              return await engine.insertSvg(source.data);
            } catch (err) {
              console.warn(
                "engine.insertSvg failed, falling back to raster:",
                err,
              );
              const svgBlob = new Blob([source.data], {
                type: "image/svg+xml;charset=utf-8",
              });
              return await engine.insertImage(svgBlob);
            }
          }
          if (source.kind === "svg_file") {
            try {
              const svgText = await source.data.text();
              return await engine.insertSvg(svgText);
            } catch (err) {
              console.warn(
                "engine.insertSvg file failed, falling back to raster:",
                err,
              );
              return await engine.insertImage(source.data);
            }
          }
          return await engine.insertImage(source.data);
        };

        void insertAction()
          .then(() => {
            selectAfterInsertIfUnchanged(engine, previousTool);
          })
          .catch((err) => {
            console.warn("Failed to insert pasted content:", err);
            onInsertError?.();
          });
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [nodeId, engine, onInsertError]);

  const dropHandlers = {
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setFileDragOver(true);
    },
    onDragLeave: (event) => {
      // Dragging over a child fires leave too; only clear when truly outside.
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setFileDragOver(false);
      }
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFileDragOver(false);

      // Check for .voo project file drop
      const allFiles = Array.from(event.dataTransfer.files ?? []);
      const vooFile = allFiles.find(
        (file) =>
          file.name &&
          (file.name.toLowerCase().endsWith(".voo") ||
            (file.name.toLowerCase().endsWith(".json") &&
              !file.type.startsWith("image/"))),
      );
      if (vooFile && onOpenVoo) {
        onOpenVoo(vooFile);
        return;
      }

      const previousTool = engine?.getTool?.();
      const point = engine?.toDocPoint(event.clientX, event.clientY);

      // Some hosts expose only DataTransfer items. Decode the complete batch
      // before publishing one synchronous, undoable document change.
      const rawFiles = allFiles.filter(isEditorImageFile);
      const imageFiles = rawFiles.length ? rawFiles : Array.from(event.dataTransfer.items ?? [])
        .filter(item => item.kind === "file" && item.type.startsWith("image/"))
        .map(item => item.getAsFile()).filter(Boolean);
      if (imageFiles.length) {
        void importEditorImageBatch(engine, imageFiles, point)
          .then(() => selectAfterInsertIfUnchanged(engine, previousTool))
          .catch(error => {
            console.warn("Failed to insert dropped images:", error);
            onInsertError?.();
          });
        return;
      }

      // 3. Dragged web image URL / HTML / SVG markup
      const uri = event.dataTransfer.getData("text/uri-list");
      const html = event.dataTransfer.getData("text/html");
      const text = event.dataTransfer.getData("text/plain");

      if (text && isSvgString(text)) {
        void (async () => {
          try {
            await engine?.insertSvg(text, point);
            selectAfterInsertIfUnchanged(engine, previousTool);
          } catch (err) {
            console.warn(
              "Failed to insert dropped SVG markup as vector, falling back:",
              err,
            );
            const svgBlob = new Blob([text], {
              type: "image/svg+xml;charset=utf-8",
            });
            await engine?.insertImage(svgBlob, point);
            selectAfterInsertIfUnchanged(engine, previousTool);
          }
        })().catch((err) => {
          console.warn("Failed to insert dropped SVG markup:", err);
          onInsertError?.();
        });
        return;
      }

      let imageUrl = uri?.trim();
      if (!imageUrl && html) {
        const svgInHtml = extractSvgFromHtml(html);
        if (svgInHtml) {
          void (async () => {
            try {
              await engine?.insertSvg(svgInHtml, point);
              selectAfterInsertIfUnchanged(engine, previousTool);
            } catch {
              // Ignore fallback
            }
          })();
          return;
        }
        const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
        if (match) imageUrl = match[1];
      }
      if (
        !imageUrl &&
        text &&
        (/^https?:\/\/.+/i.test(text) || text.startsWith("data:image/"))
      ) {
        imageUrl = text.trim();
      }

      if (imageUrl) {
        void engine
          ?.insertImage(imageUrl, point)
          .then(() => {
            selectAfterInsertIfUnchanged(engine, previousTool);
          })
          .catch((err) => {
            console.warn("Failed to insert dragged image URL", err);
            onInsertError?.();
          });
      }
    },
  };

  return { fileDragOver, dropHandlers };
}
