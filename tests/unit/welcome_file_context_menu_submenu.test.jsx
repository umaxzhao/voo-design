import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  WelcomeFileContextMenu,
  WelcomeMoveToPanel,
  getMoveTargets,
} from "../../src/canvas/components/welcome_dashboard/welcome_file_context_menu.jsx";

const t = (key) => key;
const FOLDERS = [
  { id: "f1", name: "Project" },
  { id: "f2", name: "Project 2" },
];
const noop = () => {};

/** Renders the top-level file context menu with the given file and folders. */
function renderMenu({ item, folders = FOLDERS }) {
  return renderToStaticMarkup(
    <WelcomeFileContextMenu
      t={t}
      item={item}
      isTrash={false}
      folders={folders}
      handleRestore={noop}
      handleDeletePermanently={noop}
      handleOpenRecent={noop}
      handleOpenLocal={noop}
      handleToggleStar={noop}
      handleMoveToFolder={noop}
      handleStartRename={noop}
      handleDuplicate={noop}
      handleMoveToTrash={noop}
    />,
  );
}

/** Counts "welcome.folders.moveTo" labels, excluding the "moveToRoot" key. */
function countMoveToLabels(markup) {
  return (markup.match(/welcome\.folders\.moveTo(?!Root)/g) || []).length;
}

describe("file context menu: move-to submenu", () => {
  it("shows exactly one move-to item at the top level", () => {
    const markup = renderMenu({ item: { id: "a", folder: null } });

    expect(countMoveToLabels(markup)).toBe(1);
    expect(markup).toContain('aria-haspopup="menu"');
  });

  it("never lists a per-folder 'move to <name>' label at the top level", () => {
    const markup = renderMenu({ item: { id: "a", folder: null } });

    expect(markup).not.toContain("welcome.folders.moveTo Project");
    expect(markup).not.toContain("welcome.folders.moveTo Project 2");
  });

  it("keeps the top-level move-to item when the file is already in a folder", () => {
    const markup = renderMenu({ item: { id: "a", folder: "Project" } });

    expect(countMoveToLabels(markup)).toBe(1);
  });

  it("omits the move-to item entirely when there is nowhere to move", () => {
    const markup = renderMenu({ item: { id: "a", folder: null }, folders: [] });

    expect(countMoveToLabels(markup)).toBe(0);
    expect(markup).not.toContain("welcome.folders.moveToRoot");
  });

  it("lists both folder names in the submenu, excluding the current folder", () => {
    const targets = getMoveTargets({ id: "a", folder: "Project" }, FOLDERS);

    expect(targets.folderTargets.map((f) => f.name)).toEqual(["Project 2"]);

    const twoFolders = getMoveTargets({ id: "a", folder: null }, FOLDERS);
    const markup = renderToStaticMarkup(
      <WelcomeMoveToPanel
        t={t}
        folderTargets={twoFolders.folderTargets}
        showRoot={twoFolders.showRoot}
        anchor={{ top: 0, left: 0 }}
        panelRef={{ current: null }}
        onChoose={noop}
      />,
    );

    expect(markup).toContain(">Project<");
    expect(markup).toContain(">Project 2<");
    expect(markup).not.toContain("welcome.folders.moveToRoot");
  });

  it("lists moveToRoot in the submenu only when the file is in a folder", () => {
    const inFolder = getMoveTargets({ id: "a", folder: "Project" }, FOLDERS);
    const atRoot = getMoveTargets({ id: "a", folder: null }, FOLDERS);

    expect(inFolder.showRoot).toBe(true);
    expect(atRoot.showRoot).toBe(false);

    const panel = (targets) =>
      renderToStaticMarkup(
        <WelcomeMoveToPanel
          t={t}
          folderTargets={targets.folderTargets}
          showRoot={targets.showRoot}
          anchor={{ top: 0, left: 0 }}
          panelRef={{ current: null }}
          onChoose={noop}
        />,
      );

    expect(panel(inFolder)).toContain("welcome.folders.moveToRoot");
    expect(panel(atRoot)).not.toContain("welcome.folders.moveToRoot");
  });

  it("reports no visible destinations when there is nowhere to move", () => {
    const none = getMoveTargets({ id: "a", folder: null }, []);

    expect(none.visible).toBe(false);
  });
});
