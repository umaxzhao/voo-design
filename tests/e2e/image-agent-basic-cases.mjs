import assert from "node:assert/strict";

/** Positive MCP calls assert the resulting live document, not just successful transport. */
export function basicAgentCases({
  call,
  doc,
  node,
  page,
  image
}) {
  const cases = {};
  cases.build_layout = async () => {
    await call("build_layout", {
      nodes: [{
        type: "rect",
        name: "Built",
        x: 320,
        y: 100,
        width: 40,
        height: 30,
        fill: "#00ff00"
      }]
    });
    assert.ok((await doc()).nodes.some(n => n.fill === "#00ff00"));
  };
  for (const name of ["describe_selection", "inspect_layer_tree", "find_layers"]) cases[name] = async () => {
    const result = await call(name, name === "find_layers" ? {
      name: "Audit A"
    } : {});
    assert.ok(JSON.stringify(result).includes("a"));
  };
  cases.mutate_layer_layout = async () => {
    await call("mutate_layer_layout", {
      layerId: "a",
      patch: {
        x: 125,
        width: 45
      }
    });
    assert.equal((await node("a")).x, 125);
    assert.equal((await node("a")).width, 45);
  };
  cases.mutate_layer_style = async () => {
    await call("mutate_layer_style", {
      layerId: "a",
      patch: {
        fill: "#00ff00",
        opacity: 0.6,
        strokeDash: [3, 2],
        effects: {
          shadow: {
            enabled: true,
            blur: 5
          }
        }
      }
    });
    const n = await node("a");
    assert.equal(n.fill, "#00ff00");
    assert.equal(n.opacity, 0.6);
    assert.ok(n.effects.shadow.enabled);
  };
  cases.mutate_layer_text = async () => {
    await call("mutate_layer_text", {
      layerId: "text",
      patch: {
        text: "Updated",
        italic: true,
        lineHeight: 1.6,
        letterSpacing: 2
      }
    });
    const n = await node("text");
    assert.equal(n.text, "Updated");
    assert.equal(n.italic, true);
    assert.equal(n.lineHeight, 1.6);
  };
  cases.mutate_auto_layout = async () => {
    await call("mutate_auto_layout", {
      layerId: "frame",
      config: {
        enabled: true,
        direction: "horizontal",
        alignment: "stretch",
        padding: 5
      }
    });
    assert.equal((await node("frame")).autoLayout.alignItems, "stretch");
    assert.equal((await node("child")).height, 70);
  };
  cases.batch_mutate_layers = async () => {
    await call("batch_mutate_layers", {
      mutations: [{
        type: "layout",
        layerId: "a",
        patch: {
          x: 145
        }
      }, {
        type: "style",
        layerId: "b",
        patch: {
          fill: "#00ff00"
        }
      }]
    });
    assert.equal((await node("a")).x, 145);
    assert.equal((await node("b")).fill, "#00ff00");
    await call("undo");
    assert.equal((await node("a")).x, 100);
    assert.equal((await node("b")).fill, "#0000ff");
  };
  cases.create_shape = async () => {
    await call("create_shape", {
      kind: "ellipse",
      x: 320,
      y: 100,
      width: 40,
      height: 30,
      name: "New ellipse"
    });
    assert.ok((await doc()).nodes.some(n => n.kind === "ellipse" && n.name === "New ellipse"));
  };
  cases.delete_layers = async () => {
    await call("delete_layers", {
      layerIds: ["a"]
    });
    assert.equal(await node("a"), null);
    await call("undo");
    assert.ok(await node("a"));
  };
  cases.duplicate_layer = async () => {
    const before = (await doc()).nodes.length;
    await call("duplicate_layer", {
      layerId: "frame"
    });
    assert.equal((await doc()).nodes.length, before + 2);
  };
  cases.fork_frame = async () => {
    await call("fork_frame", {
      frameId: "frame",
      name: "Fork",
      direction: "right"
    });
    const fork = (await doc()).nodes.find(n => n.name === "Fork");
    assert.ok(fork?.isFrame);
    assert.ok((await doc()).nodes.some(n => n.parentId === fork.id));
  };
  cases.select_layers = async () => {
    await call("select_layers", {
      layerIds: ["a", "b"]
    });
    assert.deepEqual((await page.evaluate(() => window.__vooEditor.getSelectedIds())).sort(), ["a", "b"]);
  };
  cases.group_layers = async () => {
    await call("group_layers", {
      layerIds: ["a", "b"],
      name: "Pair"
    });
    const group = (await doc()).nodes.find(n => n.name === "Pair");
    assert.ok(group);
    assert.equal((await node("a")).parentId, group.id);
    assert.equal((await node("b")).parentId, group.id);
  };
  cases.ungroup_layers = async () => {
    await cases.group_layers();
    const group = (await node("a")).parentId;
    await call("ungroup_layers", {
      groupId: group
    });
    assert.equal((await node("a")).parentId ?? null, null);
    assert.equal(await node(group), null);
  };
  cases.reorder_layer = async () => {
    await call("reorder_layer", {
      layerId: "a",
      position: "front"
    });
    assert.equal((await doc()).nodes.at(-1).id, "a");
  };
  cases.rename_layer = async () => {
    await call("rename_layer", {
      layerId: "a",
      name: "Renamed"
    });
    assert.equal((await node("a")).name, "Renamed");
  };
  cases.create_path = async () => {
    await call("create_path", {
      d: "M 0 0 L 60 0 L 30 50 Z",
      x: 320,
      y: 100,
      fill: "#00ff00",
      name: "Triangle"
    });
    assert.ok((await doc()).nodes.some(n => n.kind === "path" && n.name === "Triangle"));
  };
  cases.place_image = async () => {
    const url = await page.evaluate(id => window.__vooEditor.exportNodePng(id), image.id);
    const count = (await doc()).nodes.length;
    await call("place_image", {
      url,
      x: 320,
      y: 100,
      width: 32,
      height: 32,
      name: "Placed"
    });
    assert.equal((await doc()).nodes.length, count + 1);
    assert.ok((await doc()).nodes.some(n => n.kind === "image" && n.name === "Placed"));
  };
  cases.capture_canvas = async () => {
    const result = await call("capture_canvas", {
      maxSize: 256
    });
    assert.match(JSON.stringify(result), /data:image\/png/);
  };
  cases.find_empty_space = async () => {
    const result = await call("find_empty_space", {
      width: 60,
      height: 40,
      padding: 20
    });
    assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
  };
  cases.align_layers = async () => {
    await call("align_layers", {
      layerIds: ["a", "b"],
      align: "top"
    });
    assert.equal((await node("b")).y, (await node("a")).y);
  };
  cases.distribute_layers = async () => {
    await call("distribute_layers", {
      layerIds: ["a", "b", "c"],
      axis: "horizontal",
      spacing: 12
    });
    assert.equal((await node("b")).x - (await node("a")).x, 42);
    assert.equal((await node("c")).x - (await node("b")).x, 42);
  };
  cases.create_frame = async () => {
    await call("create_frame", {
      x: 320,
      y: 250,
      width: 80,
      height: 60,
      name: "New frame",
      layout: "none"
    });
    assert.ok((await doc()).nodes.some(n => n.name === "New frame" && n.isFrame));
  };
  cases.boolean_combine = async () => {
    await call("boolean_combine", {
      operation: "union",
      layerIds: ["a", "b"]
    });
    assert.ok((await doc()).nodes.some(n => n.kind === "boolean"));
    await call("undo");
    assert.ok(await node("a"));
  };
  cases.set_constraints = async () => {
    await call("set_constraints", {
      layerIds: ["a"],
      horizontal: "right",
      vertical: "bottom"
    });
    assert.equal((await node("a")).constraints.horizontal, "right");
  };
  cases.export_layers = async () => {
    const result = await call("export_layers", {
      layerIds: [image.id],
      includeDataUrl: true
    });
    assert.match(JSON.stringify(result), /data:image\/png/);
  };
  cases.undo = async () => {
    await cases.rename_layer();
    await call("undo");
    assert.equal((await node("a")).name, "Audit A");
  };
  cases.redo = async () => {
    await cases.undo();
    await call("redo");
    assert.equal((await node("a")).name, "Renamed");
  };
  for (const name of ["inspect_layout", "lint_design"]) cases[name] = async () => {
    const before = await doc();
    const result = await call(name);
    assert.ok(result && typeof result === "object");
    assert.deepEqual(await doc(), before);
  };
  cases.export_code = async () => {
    const result = await call("export_code", {
      format: "html",
      scope: "page"
    });
    assert.match(result.code, /Audit|Hello|div|svg/);
  };
  cases.create_icon = async () => {
    const before = await page.evaluate(() => window.__vooEditor.serialise());
    await call("create_icon", {
      icon: "search",
      x: 320,
      y: 100,
      size: 24,
      color: "#00ff00"
    });
    assert.ok((await doc()).nodes.length > before.nodes.length);
    await call("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before);
  };
  cases.vectorize_image = async () => {
    const before = await page.evaluate(() => window.__vooEditor.serialise());
    await call("vectorize_image", {
      layerId: image.id,
      colors: 3,
      minArea: 8
    });
    assert.ok((await doc()).nodes.length > before.nodes.length);
    assert.ok(await node(image.id));
    await call("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before);
  };
  cases.set_frame_slot = async () => {
    await call("set_frame_slot", {
      frameId: "frame",
      slot: ["Button"]
    });
    assert.deepEqual((await node("frame")).slot, ["Button"]);
    await call("set_frame_slot", {
      frameId: "frame",
      slot: null
    });
    assert.equal((await node("frame")).slot, null);
  };
  cases.get_frame_slot = async () => {
    await call("set_frame_slot", {
      frameId: "frame",
      slot: ["Button"]
    });
    assert.deepEqual((await call("get_frame_slot", {
      frameId: "frame"
    })).slot, ["Button"]);
  };
  cases.set_text_range_style = async () => {
    await call("set_text_range_style", {
      layerId: "text",
      start: 0,
      end: 5,
      style: {
        fontWeight: 700
      }
    });
    assert.ok((await node("text")).textRuns?.length || (await node("text")).textRangeStyles?.length);
  };
  const createPath = async () => {
    await call("create_path", {
      d: "M 0 0 L 60 0 L 30 50 Z",
      name: "EditablePath"
    });
    return (await doc()).nodes.find(n => n.name === "EditablePath").id;
  };
  cases.get_path_nodes = async () => {
    const layerId = await createPath();
    const result = await call("get_path_nodes", {
      layerId
    });
    assert.ok(JSON.stringify(result).includes("points"));
  };
  cases.edit_path_nodes = async () => {
    const layerId = await createPath();
    const before = await node(layerId);
    await call("edit_path_nodes", {
      layerId,
      ops: [{
        op: "move",
        index: 0,
        dx: 8,
        dy: 9
      }]
    });
    assert.notDeepEqual(await node(layerId), before);
  };
  return cases;
}
