import { describe, it, expect } from "vitest";
import { projectCover } from "../../src/canvas/previews/project_cover.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";
const scene = { ...createDocument(100, 80, "transparent"), nodes: [{id:"rect",kind:"rect",x:-300,y:-200,width:100,height:80,fill:"#ff0000",visible:true,opacity:1}] };
describe("project covers", () => {
  it("recovers artwork outside document metadata bounds", () => {
    const cover = projectCover({document:scene});
    const svg = decodeURIComponent(cover.split(',').slice(1).join(','));
    expect(svg).toContain('#ff0000');
    expect(svg).toContain('viewBox="-300 -200 100 80"');
  });
  it("prefers a supplied cover but can regenerate a broken embedded image", () => {
    const file={document:scene,preview:"data:image/png;base64,broken"};
    expect(projectCover(file)).toBe(file.preview);
    expect(projectCover(file,{preferEmbedded:false})).toContain('data:image/svg+xml');
  });
  it("uses the focused page when rendering a multi-page draft", () => {
    const file={document:{...scene,editingNodeId:"second",pages:[{id:"second",sceneDoc:{...scene,nodes:[{...scene.nodes[0],fill:'#00ff00'}]}}]}};
    expect(decodeURIComponent(projectCover(file))).toContain('#00ff00');
  });
  it("does not fabricate artwork when the document is empty", () => {
    expect(projectCover({document:{nodes:[]}})).toBeNull();
  });
  it("embeds project image assets without depending on an open editor", () => {
    const bitmap = "data:image/png;base64,project-image";
    const document = {...scene,nodes:[{...scene.nodes[0],kind:"image",imageId:"photo"}]};
    expect(decodeURIComponent(projectCover({document,assets:{photo:bitmap}}))).toContain(`href="${bitmap}"`);
  });
});
