import { useState, useCallback, useRef } from "react";

/** Reference-image upload cap — data URLs go into the store and the LLM context. */
export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
/** Text files dropped into the input box are capped so one attachment cannot
 * flood the LLM context window. */
export const MAX_TEXT_ATTACHMENT_BYTES = 100 * 1024;

export function useAgentAttachments({ t, setInputText, textareaRef }) {
  const [referenceImages, setReferenceImages] = useState([]);
  const [canvasReference, setCanvasReference] = useState(null);
  const [refImageError, setRefImageError] = useState(null);
  const fileInputRef = useRef(null);

  /** Attach image files as reference images. Shared by the file picker and
   *  textarea paste, so both enforce the same size cap and error copy. */
  const addReferenceImageFiles = useCallback(
    (files) => {
      const tooLarge = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        // Oversized references would blow up the canvas store and the LLM
        // context as data URLs — cap them and tell the user which were dropped.
        if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
          tooLarge.push(file.name);
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setReferenceImages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), name: file.name, url: reader.result },
          ]);
        };
        reader.readAsDataURL(file);
      }
      if (tooLarge.length > 0) {
        setRefImageError(
          t("agent.refImageTooLarge", {
            n: tooLarge.length,
            mb: Math.round(MAX_REFERENCE_IMAGE_BYTES / (1024 * 1024)),
          }),
        );
      }
    },
    [t],
  );

  /** Read a text file (.md/.txt/…) into the input box for review before send. */
  const appendTextFile = useCallback(
    (file) => {
      if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
        setRefImageError(
          t("agent.textFileTooLarge", {
            name: file.name,
            kb: Math.round(MAX_TEXT_ATTACHMENT_BYTES / 1024),
          }),
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "").trim();
        if (!text) return;
        setInputText((prev) => {
          const existing = prev.trimEnd();
          return existing ? `${existing}\n\n${text}` : text;
        });
        setTimeout(() => textareaRef.current?.focus(), 50);
      };
      reader.readAsText(file);
    },
    [setInputText, t, textareaRef],
  );

  /** The + button: images attach as references, text files read into the input. */
  const handleAttachmentSelect = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!files.length) return;
      setRefImageError(null);
      addReferenceImageFiles(files);
      for (const file of files) {
        if (file.type.startsWith("image/")) continue;
        if (
          file.type.startsWith("text/") ||
          /\.(md|markdown|txt)$/i.test(file.name)
        ) {
          appendTextFile(file);
        }
      }
    },
    [addReferenceImageFiles, appendTextFile],
  );

  /** Pasting a reference image into the textarea attaches it like the + button. */
  const handlePaste = useCallback(
    (e) => {
      const images = Array.from(e.clipboardData?.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (images.length === 0) return;
      e.preventDefault();
      setRefImageError(null);
      addReferenceImageFiles(images);
    },
    [addReferenceImageFiles],
  );

  const handleRemoveReferenceImage = useCallback((index) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addReferenceImage = useCallback((item) => {
    if (!item?.url) return;
    setReferenceImages((prev) => {
      if (prev.some((img) => img.id === item.id || img.url === item.url)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: item.id || crypto.randomUUID(),
          name: item.name || "Material",
          url: item.url,
        },
      ];
    });
  }, []);

  const removeReferenceImageById = useCallback((id) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  return {
    referenceImages,
    canvasReference,
    setCanvasReference,
    setReferenceImages,
    refImageError,
    setRefImageError,
    fileInputRef,
    handleAttachmentSelect,
    handlePaste,
    handleRemoveReferenceImage,
    addReferenceImage,
    removeReferenceImageById,
  };
}
