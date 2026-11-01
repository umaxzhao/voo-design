import { useCallback, useState } from "react";
import {
  MAX_REFERENCE_IMAGES,
  readAttachmentFiles,
} from "../welcome_dashboard/generation_intent.js";

/** Shared image-reference input state for the canvas chat composer. */
export function useReferenceImages(setError) {
  const [attachments, setAttachments] = useState([]);
  const addFiles = useCallback(async (files) => {
    const { attachments: parsed, errors } = await readAttachmentFiles(files, {
      limit: MAX_REFERENCE_IMAGES,
    });
    setAttachments((current) => [
      ...current,
      ...parsed
        .filter((attachment) => attachment.kind === "image")
        .map((attachment) => ({ ...attachment, id: crypto.randomUUID() })),
    ].slice(0, MAX_REFERENCE_IMAGES));
    if (errors.length) setError(errors.join("\n"));
  }, [setError]);
  const remove = useCallback((attachment) => {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  }, []);
  const clear = useCallback(() => setAttachments([]), []);
  return { attachments, addFiles, remove, clear };
}
