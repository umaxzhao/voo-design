import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_REFERENCE_IMAGES } from "./welcome_dashboard/generation-options.js";

let readerPromise;

/** Read clipboard files without intercepting ordinary text or HTML paste. */
export function clipboardImageFiles(clipboardData) {
  const items = Array.from(clipboardData?.items ?? []);
  const images = items.filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter(Boolean);
  return images.length ? images : Array.from(clipboardData?.files ?? [])
    .filter(file => file.type.startsWith("image/"));
}

/** Shared attachment boundary for picker and clipboard, including concurrent reads. */
export function usePromptAttachments(t) {
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const stateRef = useRef({ attachments: [], reserved: 0, epoch: 0, mounted: true });
  useEffect(() => {
    stateRef.current.mounted = true;
    return () => { stateRef.current.mounted = false; stateRef.current.epoch += 1; };
  }, []);
  const clearAttachments = useCallback(() => {
    const state = stateRef.current;
    state.epoch += 1;
    state.reserved = 0;
    state.attachments = [];
    setAttachments([]);
    setAttachmentError("");
    setIsReading(false);
  }, []);
  const removeAttachment = useCallback(target => {
    const state = stateRef.current;
    state.attachments = state.attachments.filter(item => item !== target);
    setAttachments(state.attachments);
    setAttachmentError("");
  }, []);
  const addFiles = useCallback(async fileList => {
    const state = stateRef.current;
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const available = MAX_REFERENCE_IMAGES - state.attachments.length - state.reserved;
    if (available <= 0) {
      setAttachmentError(t("welcome.prompt.attachmentLimit", { n: MAX_REFERENCE_IMAGES }));
      return;
    }
    const selected = files.slice(0, available);
    const epoch = state.epoch;
    state.reserved += selected.length;
    setIsReading(true);
    try {
      const { readAttachmentFiles } = await (readerPromise ??= import("./welcome_dashboard/generation_intent.js"));
      const result = await readAttachmentFiles(selected, { limit: available });
      if (!state.mounted || state.epoch !== epoch) return;
      state.attachments = [...state.attachments, ...result.attachments.map(item => ({ ...item, id: crypto.randomUUID() }))];
      setAttachments(state.attachments);
      setAttachmentError(result.errors.length ? t("welcome.prompt.attachmentReadError")
        : files.length > available ? t("welcome.prompt.attachmentLimit", { n: MAX_REFERENCE_IMAGES }) : "");
    } catch (error) {
      if (state.mounted && state.epoch === epoch) setAttachmentError(t("welcome.prompt.attachmentReadError"));
      throw error;
    } finally {
      if (state.mounted && state.epoch === epoch) {
        state.reserved -= selected.length;
        setIsReading(state.reserved > 0);
      }
    }
  }, [t]);
  const onPaste = useCallback(event => {
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    return addFiles(files);
  }, [addFiles]);
  return { attachments, attachmentError, isReading, addFiles, removeAttachment, clearAttachments, onPaste };
}
