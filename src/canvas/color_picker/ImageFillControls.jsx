import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import FlatSelect from "../components/flat_select.jsx";
import { useI18n } from "../use_i18n.js";

/** File/decode work belongs to this open paint editor and is cancelled on close. */
export default function ImageFillControls({
  imageUrl,
  scaleMode,
  onChange,
  onScaleMode
}) {
  const {
    t
  } = useI18n();
  const fileRef = useRef(null);
  const request = useRef({
    version: 0,
    reader: null
  });
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    const pending = request.current;
    return () => {
      pending.version += 1;
      pending.reader?.abort();
    };
  }, []);
  const choose = file => {
    if (!file) return;
    const pending = request.current;
    pending.version += 1;
    const version = pending.version;
    pending.reader?.abort();
    if (file.type && !file.type.startsWith("image/")) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    const reader = new FileReader();
    pending.reader = reader;
    const fail = () => {
      if (version === pending.version) setStatus("error");
    };
    reader.onerror = fail;
    reader.onload = async () => {
      if (version !== pending.version) return;
      const image = new Image();
      image.src = String(reader.result);
      try {
        await image.decode();
      } catch {
        fail();
        return;
      }
      if (version !== pending.version) return;
      try {
        const applied = await onChange(image.src, {
          shouldApply: () => version === pending.version
        });
        if (version === pending.version) setStatus(applied === false ? "error" : "idle");
      } catch (error) {
        console.warn("[fill-picker] Image replacement failed", error);
        fail();
      }
    };
    reader.readAsDataURL(file);
  };
  return <div className="flex flex-col gap-3" data-testid="fill-image-controls">
    <button type="button" disabled={status === "loading"} onClick={() => fileRef.current?.click()} aria-label={t(imageUrl ? "editor.fillPicker.replaceImage" : "editor.fillPicker.chooseImage")} className="flex min-h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-neutral-800 p-2 text-[11px] text-neutral-200 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint/40 disabled:cursor-wait">
      {imageUrl ? <img src={imageUrl} alt="" className="max-h-32 w-full rounded-lg object-contain" /> : <ImagePlus size={24} strokeWidth={1.5} />}
      <span>{t(status === "loading" ? "editor.fillPicker.loadingImage" : imageUrl ? "editor.fillPicker.replaceImage" : "editor.fillPicker.chooseImage")}</span>
    </button>
    <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label={t("editor.props.fillImage")} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      choose(file);
    }} />
    {status === "error" ? <p role="alert" className="text-[11px] text-neutral-200">{t("editor.fillPicker.imageError")}</p> : null}
    <FlatSelect value={scaleMode} onChange={onScaleMode} label={t("editor.props.imageScaleMode")} disabled={!imageUrl} options={["fill", "fit", "tile"].map(value => ({
      value,
      label: t(`editor.props.imageScale${value[0].toUpperCase()}${value.slice(1)}`)
    }))} triggerClassName="!w-full !rounded-xl !bg-neutral-800 !text-[11px]" portal panelClassName="!z-[300]" />
  </div>;
}
ImageFillControls.propTypes = {
  imageUrl: PropTypes.string,
  scaleMode: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onScaleMode: PropTypes.func.isRequired
};
