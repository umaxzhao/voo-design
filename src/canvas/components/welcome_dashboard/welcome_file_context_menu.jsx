import React from "react";
import {
  Star,
  Trash2,
  RotateCcw,
  Copy,
  Pencil,
  FolderOpen,
} from "lucide-react";

/** Context action dropdown menu for a file card or row in the welcome dashboard. */
export function WelcomeFileContextMenu({
  t,
  item,
  isTrash,
  folders,
  handleRestore,
  handleDeletePermanently,
  handleOpenRecent,
  handleOpenLocal,
  handleToggleStar,
  handleMoveToFolder,
  handleStartRename,
  handleDuplicate,
  handleMoveToTrash,
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-7 w-36 rounded-2xl bg-neutral-900 border border-white/10 shadow-menu py-1 z-30"
    >
      {isTrash ? (
        <>
          <button
            type="button"
            onClick={(e) => handleRestore(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <RotateCcw size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.restore")}</span>
          </button>
          <button
            type="button"
            onClick={(e) => handleDeletePermanently(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>{t("welcome.actions.deletePermanently")}</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => handleOpenRecent(item)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <FolderOpen size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.openFile")}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenLocal}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <FolderOpen size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.openLocal")}</span>
          </button>
          <button
            type="button"
            onClick={(e) => handleToggleStar(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Star size={12} className={item.starred ? "text-neutral-100 fill-neutral-100" : "text-neutral-400"} />
            <span>{item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}</span>
          </button>
          {folders
            .filter((folder) => folder.name !== item.folder)
            .map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={(e) => handleMoveToFolder(e, item.id, folder.name)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
              >
                <FolderOpen size={12} className="text-neutral-400" />
                <span>{`${t("welcome.folders.moveTo")} ${folder.name}`}</span>
              </button>
            ))}
          {item.folder ? (
            <button
              type="button"
              onClick={(e) => handleMoveToFolder(e, item.id, null)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
            >
              <FolderOpen size={12} className="text-neutral-400" />
              <span>{t("welcome.folders.moveToRoot")}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => handleStartRename(e, item)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Pencil size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.rename")}</span>
          </button>
          <button
            type="button"
            onClick={(e) => handleDuplicate(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Copy size={12} className="text-neutral-400" />
            <span>{t("welcome.actions.duplicate")}</span>
          </button>
          <div className="h-px bg-white/10 my-1" />
          <button
            type="button"
            onClick={(e) => handleMoveToTrash(e, item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>{t("welcome.actions.moveToTrash")}</span>
          </button>
        </>
      )}
    </div>
  );
}
