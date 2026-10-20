function asRegions(selection) {
    if (selection.kind === "composite")
        return selection.regions ?? [];
    return [
        {
            operation: "replace",
            kind: selection.kind,
            points: selection.points,
        },
    ];
}
export function combineRasterSelections(previous, next, operation) {
    if (!previous || operation === "replace")
        return next;
    const nextRegion = {
        operation,
        kind: next.kind === "composite" ? "lasso" : next.kind,
        points: next.points,
    };
    return {
        kind: "composite",
        points: [],
        feather: Math.max(previous.feather, next.feather),
        regions: [...asRegions(previous), nextRegion],
    };
}
export function getRasterSelectionRegions(selection) {
    return asRegions(selection);
}
//# sourceMappingURL=raster-selection.js.map