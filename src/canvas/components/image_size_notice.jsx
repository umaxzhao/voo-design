import React, { useEffect, useState } from "react";
import { subscribePersistenceAlert } from "../editor/editor_persist_events.js";
import { useI18n } from "../use_i18n.js";

export function subscribeImageSizeNotice(show) {
  return subscribePersistenceAlert((alert) => {
    if (alert.type === "image-too-large") show("app.imageTooLarge");
  });
}

export function ImageSizeMessage({ message }) {
  const { t } = useI18n();
  if (!message) return null;
  return <div role="alert" className="fixed top-28 left-1/2 z-[210] max-w-[90vw] -translate-x-1/2 rounded-2xl bg-black/90 px-4 py-3 text-xs text-rose-300 shadow-pop backdrop-blur-md">{t(message)}</div>;
}

/** Uses the editor alert bus and toast styling, above both welcome and editor UI. */
export default function ImageSizeNotice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => subscribeImageSizeNotice((message) => setNotice({ message })), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  return <ImageSizeMessage message={notice?.message} />;
}
