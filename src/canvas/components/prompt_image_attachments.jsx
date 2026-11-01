import PropTypes from "prop-types";
import { X } from "lucide-react";

/** Reference images stay in the composer until the user submits the request. */
export default function PromptImageAttachments({ references, t }) {
  const { attachments, removeAttachment, attachmentError } = references;
  return <>
    {attachments.length > 0 && <ul aria-label={t("welcome.prompt.attachments")} className="mb-2 flex flex-wrap gap-2">
      {attachments.map(attachment => <li key={attachment.id} className="flex max-w-48 items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-neutral-300">
        <img src={attachment.dataUrl} alt="" className="size-8 rounded-lg object-cover" />
        <span className="truncate">{attachment.name}</span>
        <button type="button" onClick={() => removeAttachment(attachment)} aria-label={t("welcome.prompt.removeAttachment")} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"><X size={12} aria-hidden="true" /></button>
      </li>)}
    </ul>}
    {attachmentError && <p role="alert" className="mb-2 text-xs text-rose-400">{attachmentError}</p>}
  </>;
}
PromptImageAttachments.propTypes = { references: PropTypes.object.isRequired, t: PropTypes.func.isRequired };
