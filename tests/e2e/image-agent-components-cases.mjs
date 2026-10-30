import assert from "node:assert/strict";
export function componentAgentCases({
  call,
  doc,
  node
}) {
  const cases = {};
  const master = async () => {
    const result = await call("create_component", {
      layerId: "text",
      name: "Audit component"
    });
    assert.ok(result.componentId);
    return result;
  };
  const instance = async () => {
    const component = await master();
    const result = await call("create_instance", {
      componentId: component.componentId,
      x: 350,
      y: 150,
      name: "Audit instance"
    });
    const instanceId = result.instanceId ?? result.layerId;
    assert.equal((await node(instanceId)).sourceCanvasId, component.componentId);
    return {
      ...component,
      instanceId
    };
  };
  cases.create_component = async () => {
    const result = await master();
    assert.ok((await doc()).components[result.componentId]);
  };
  cases.create_instance = instance;
  cases.set_instance_override = async () => {
    const result = await instance();
    await call("set_instance_override", {
      instanceId: result.instanceId,
      patch: {
        text: "Overridden"
      }
    });
    assert.match(JSON.stringify(await node(result.instanceId)), /Overridden/);
    await call("set_instance_override", {
      instanceId: result.instanceId,
      patch: {
        text: null
      }
    });
    assert.doesNotMatch(JSON.stringify(await node(result.instanceId)), /Overridden/);
  };
  cases.reset_instance_overrides = async () => {
    const result = await instance();
    await call("set_instance_override", {
      instanceId: result.instanceId,
      patch: {
        text: "Overridden"
      }
    });
    await call("reset_instance_overrides", {
      instanceId: result.instanceId
    });
    assert.doesNotMatch(JSON.stringify(await node(result.instanceId)), /Overridden/);
  };
  cases.swap_instance = async () => {
    const result = await instance();
    const variant = await call("create_component_variant", {
      sourceComponentId: result.componentId,
      variantName: "Other"
    });
    await call("swap_instance", {
      instanceId: result.instanceId,
      componentId: variant.componentId
    });
    assert.equal((await node(result.instanceId)).sourceCanvasId, variant.componentId);
  };
  cases.create_component_variant = async () => {
    const source = await master();
    const result = await call("create_component_variant", {
      sourceComponentId: source.componentId,
      variantName: "State=Hover"
    });
    assert.equal((await doc()).components[result.componentId].variantName, "State=Hover");
  };
  cases.create_component_variants_batch = async () => {
    const source = await master();
    const result = await call("create_component_variants_batch", {
      sourceComponentId: source.componentId,
      variants: [{
        State: "Idle"
      }, {
        State: "Hover"
      }]
    });
    assert.equal(result.results.filter(entry => entry.status === "created").length, 2);
  };
  cases.create_component_variant_matrix = async () => {
    const source = await master();
    const result = await call("create_component_variant_matrix", {
      sourceComponentId: source.componentId,
      axes: {
        State: ["Idle", "Hover"],
        Size: ["S", "L"]
      }
    });
    assert.equal(result.variants.length, 4);
  };
  cases.list_component_variants = async () => {
    const source = await master();
    await call("create_component_variant", {
      sourceComponentId: source.componentId,
      variantName: "State=Hover"
    });
    const result = await call("list_component_variants", {
      componentId: source.componentId
    });
    assert.equal(result.variants.length, 2);
  };
  cases.list_instance_variant_properties = async () => {
    const source = await instance();
    await call("create_component_variant", {
      sourceComponentId: source.componentId,
      variantName: "State=Hover"
    });
    const result = await call("list_instance_variant_properties", {
      instanceId: source.instanceId
    });
    assert.ok(Array.isArray(result.axes));
  };
  cases.set_instance_variant = async () => {
    const source = await instance();
    const variant = await call("create_component_variant", {
      sourceComponentId: source.componentId,
      variantName: "State=Hover"
    });
    await call("set_instance_variant", {
      instanceId: source.instanceId,
      properties: {
        State: "Hover"
      }
    });
    assert.equal((await node(source.instanceId)).sourceCanvasId, variant.componentId);
  };
  const collection = async () => {
    const result = await call("create_variable_collection", {
      name: "Audit colours",
      modes: ["Dark"]
    });
    assert.ok(result.collectionId);
    return result;
  };
  const variable = async () => {
    const source = await collection();
    const result = await call("create_variable", {
      collectionId: source.collectionId,
      name: "Accent",
      type: "color",
      value: "#ff0000"
    });
    assert.ok(result.variableId);
    return {
      ...source,
      variableId: result.variableId
    };
  };
  cases.create_variable_collection = async () => {
    const result = await collection();
    assert.ok((await doc()).variablesV2.collections.some(item => item.id === result.collectionId));
  };
  cases.add_variable_mode = async () => {
    const source = await collection();
    const mode = await call("add_variable_mode", {
      collectionId: source.collectionId,
      name: "Contrast"
    });
    assert.ok((await doc()).variablesV2.collections.find(item => item.id === source.collectionId).modes.some(item => item.id === mode.modeId));
  };
  cases.create_variable = variable;
  cases.set_variable_value = async () => {
    const source = await variable();
    await call("set_variable_value", {
      variableId: source.variableId,
      value: "#00ff00"
    });
    assert.match(JSON.stringify((await doc()).variablesV2), /#00ff00/);
  };
  cases.set_active_mode = async () => {
    const source = await variable();
    const mode = await call("add_variable_mode", {
      collectionId: source.collectionId,
      name: "Contrast"
    });
    await call("set_variable_value", {
      variableId: source.variableId,
      modeId: mode.modeId,
      value: "#00ff00"
    });
    await call("bind_variable", {
      layerId: "a",
      variableId: source.variableId,
      target: "fill"
    });
    await call("set_active_mode", {
      collectionId: source.collectionId,
      modeId: mode.modeId
    });
    assert.equal((await node("a")).fill, "#00ff00");
  };
  cases.bind_variable = async () => {
    const source = await variable();
    await call("bind_variable", {
      layerId: "a",
      variableId: source.variableId,
      target: "fill"
    });
    assert.match(JSON.stringify(await node("a")), new RegExp(source.variableId));
  };
  cases.list_variables = async () => {
    const source = await variable();
    const result = await call("list_variables", {
      collectionId: source.collectionId
    });
    assert.match(JSON.stringify(result), new RegExp(source.variableId));
  };
  const style = async () => {
    const result = await call("create_style", {
      type: "paint",
      name: "Audit style",
      fromLayerId: "a"
    });
    assert.ok(result.styleId);
    return result;
  };
  cases.create_style = style;
  cases.list_styles = async () => {
    const result = await style();
    assert.match(JSON.stringify(await call("list_styles", {
      type: "paint"
    })), new RegExp(result.styleId));
  };
  cases.apply_style = async () => {
    const result = await style();
    await call("apply_style", {
      layerId: "b",
      type: "paint",
      styleId: result.styleId
    });
    assert.equal((await node("b")).fill, (await node("a")).fill);
  };
  return cases;
}
