import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeSidebar } from "../../src/canvas/components/welcome_dashboard/welcome_sidebar.jsx";

describe("welcome sidebar section dividers", () => {
  it("separates sidebar sections with whitespace instead of rules", () => {
    const html = renderToStaticMarkup(
      <WelcomeSidebar
        t={(key) => key}
        searchQuery=""
        setSearchQuery={() => {}}
        activeTab="recents"
        setActiveTab={() => {}}
        activeFolder={null}
        setActiveFolder={() => {}}
        folders={[]}
        creatingFolder={false}
        setCreatingFolder={() => {}}
        folderName=""
        setFolderName={() => {}}
        folderError=""
        setFolderError={() => {}}
        handleCreateFolder={() => {}}
        handleDeleteFolder={() => {}}
      />,
    );

    expect(html.match(/role="separator"/g)).toHaveLength(2);
    expect(html.match(/mx-2\.5 h-2/g)).toHaveLength(2);
    expect(html).not.toContain("border-white/10");
  });
});
