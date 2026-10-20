/* eslint-disable react/prop-types */
import { IconClose } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import {
  assignMediaTags,
  getNodeDisplayName,
  getNodeIcon,
  getNodeThumbnail,
} from "./agentNodeHelpers.jsx";

export default function AgentLinkedObjects({
  selectedNodes,
  storeImages,
  storeThumbnails,
  handleUnlinkNode,
}) {
  const { t } = useI18n();
  if (!selectedNodes || selectedNodes.length === 0) return null;

  const taggedNodes = assignMediaTags(selectedNodes, t);

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
      {taggedNodes.map(({ node, tag }) => {
        const displayName = getNodeDisplayName(node, t);
        const label = tag || displayName;
        const thumb = getNodeThumbnail(node, storeImages, storeThumbnails);
        const annotationCount = Array.isArray(node.data?.annotations)
          ? node.data.annotations.length
          : Array.isArray(node.annotations)
            ? node.annotations.length
            : 0;
        return (
          <div
            key={node.id}
            className="group inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.09] max-w-[220px]"
            title={`#${node.id} · ${displayName}`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="h-3.5 w-3.5 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <span className="flex-shrink-0 opacity-80">
                {getNodeIcon(node)}
              </span>
            )}
            <span className="truncate font-normal">{label}</span>
            {annotationCount > 0 ? (
              <span className="shrink-0 rounded-md bg-[#E5B2FF]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#eed0ff]">
                {t("agent.annotationBadge", { count: annotationCount })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUnlinkNode(node.id);
              }}
              aria-label={t("agent.unlinkObject")}
              title={t("agent.unlinkObject")}
              className="flex-shrink-0 ml-0.5 rounded-md p-0.5 text-neutral-500 hover:bg-white/10 hover:text-neutral-200 transition-colors"
            >
              <IconClose size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
