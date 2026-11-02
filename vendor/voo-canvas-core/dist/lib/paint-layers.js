let paintLayerSequence = 0;
export function createPaintLayerId(prefix) {
    paintLayerSequence += 1;
    return `${prefix}-${paintLayerSequence}`;
}
export function updatePaintLayer(layers, id, patch) {
    let found = false;
    const next = layers.map((layer) => {
        if (layer.id !== id)
            return layer;
        found = true;
        return { ...layer, ...patch };
    });
    if (!found)
        throw new RangeError(`Paint layer ${id} was not found`);
    return next;
}
export function removePaintLayer(layers, id) {
    if (!layers.some((layer) => layer.id === id)) {
        throw new RangeError(`Paint layer ${id} was not found`);
    }
    return layers.filter((layer) => layer.id !== id);
}
export function movePaintLayer(layers, sourceId, targetId) {
    const next = [...layers];
    const sourceIndex = next.findIndex((layer) => layer.id === sourceId);
    const targetIndex = next.findIndex((layer) => layer.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return next;
    }
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    return next;
}
//# sourceMappingURL=paint-layers.js.map