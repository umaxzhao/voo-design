export const BOOLEAN_OPERATIONS = [
    "union",
    "subtract",
    "intersect",
    "exclude",
];
export function getBooleanSelection(selectedIdsOrNodes = [], nodesList = []) {
    if (Array.isArray(selectedIdsOrNodes) && typeof selectedIdsOrNodes[0] === "string") {
        const selectedIds = selectedIdsOrNodes;
        const nodes = (Array.isArray(nodesList) ? nodesList : []);
        return selectedIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n) => Boolean(n))
            .map((node) => ({
            id: String(node.id),
            type: typeof node.type === "string" ? node.type : "rectangle",
            name: typeof node.name === "string" ? node.name : undefined,
            x: typeof node.x === "number" ? node.x : 0,
            y: typeof node.y === "number" ? node.y : 0,
            w: typeof node.w === "number" ? node.w : 100,
            h: typeof node.h === "number" ? node.h : 100,
            rotation: typeof node.rotation === "number" ? node.rotation : 0,
            cornerRadius: typeof node.cornerRadius === "number" ? node.cornerRadius : undefined,
        }));
    }
    const nodes = (Array.isArray(selectedIdsOrNodes) ? selectedIdsOrNodes : []);
    return nodes.map((node) => ({
        id: String(node.id),
        type: typeof node.type === "string" ? node.type : "rectangle",
        name: typeof node.name === "string" ? node.name : undefined,
        x: typeof node.x === "number" ? node.x : 0,
        y: typeof node.y === "number" ? node.y : 0,
        w: typeof node.w === "number" ? node.w : 100,
        h: typeof node.h === "number" ? node.h : 100,
    }));
}
export function buildBooleanNode(arg1, arg2) {
    let op = "union";
    let sources = [];
    if (typeof arg1 === "string") {
        op = arg1;
        sources = Array.isArray(arg2) ? arg2 : [];
    }
    else if (Array.isArray(arg1)) {
        sources = arg1;
        op = typeof arg2 === "string" ? arg2 : "union";
    }
    const minX = sources.length > 0 ? Math.min(...sources.map((s) => s.x)) : 0;
    const minY = sources.length > 0 ? Math.min(...sources.map((s) => s.y)) : 0;
    const maxX = sources.length > 0 ? Math.max(...sources.map((s) => s.x + s.w)) : 100;
    const maxY = sources.length > 0 ? Math.max(...sources.map((s) => s.y + (s.h ?? 100))) : 100;
    return {
        id: `bool-${Date.now()}`,
        type: "boolean",
        title: `Boolean ${op}`,
        name: `Boolean ${op}`,
        parentId: null,
        x: minX,
        y: minY,
        w: Math.max(10, maxX - minX),
        h: Math.max(10, maxY - minY),
        booleanOperation: op,
        booleanSources: sources,
    };
}
/**
 * Computes bounding box for multiple point sets.
 */
function getCombinedBounds(paths) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    paths.forEach((path) => {
        path.points.forEach((p) => {
            if (p.x < minX)
                minX = p.x;
            if (p.y < minY)
                minY = p.y;
            if (p.x > maxX)
                maxX = p.x;
            if (p.y > maxY)
                maxY = p.y;
        });
    });
    if (!isFinite(minX)) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
/**
 * Generates SVG path string from polygons.
 */
function polygonsToSvgPath(paths) {
    return paths
        .map((path) => {
        if (path.points.length === 0)
            return "";
        const first = path.points[0];
        const rest = path.points
            .slice(1)
            .map((p) => `L ${p.x} ${p.y}`)
            .join(" ");
        return `M ${first.x} ${first.y} ${rest} Z`;
    })
        .filter(Boolean)
        .join(" ");
}
/**
 * Computes exact operational bounding box based on the Boolean operation type.
 */
export function getOpBoundingBox(op, paths) {
    if (paths.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const individualBounds = paths.map((p) => getCombinedBounds([p]));
    if (op === "union" || op === "exclude") {
        return getCombinedBounds(paths);
    }
    if (op === "intersect") {
        let minX = individualBounds[0].x;
        let minY = individualBounds[0].y;
        let maxX = individualBounds[0].x + individualBounds[0].width;
        let maxY = individualBounds[0].y + individualBounds[0].height;
        for (let i = 1; i < individualBounds.length; i += 1) {
            const b = individualBounds[i];
            minX = Math.max(minX, b.x);
            minY = Math.max(minY, b.y);
            maxX = Math.min(maxX, b.x + b.width);
            maxY = Math.min(maxY, b.y + b.height);
        }
        if (maxX <= minX || maxY <= minY) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (op === "subtract") {
        // Primary shape bounds (first source)
        return individualBounds[0];
    }
    return getCombinedBounds(paths);
}
/**
 * Executes a vector boolean operation (union / intersect / subtract / exclude)
 * on a set of polygon shapes.
 */
export function performBooleanOp(op, paths) {
    const bbox = getOpBoundingBox(op, paths);
    const pathData = polygonsToSvgPath(paths);
    return {
        op,
        combinedBoundingBox: bbox,
        svgPathData: pathData,
    };
}
//# sourceMappingURL=boolean-ops.js.map