function parseLegacyLinearPath(pathData) {
    const numbers = pathData.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number);
    if (!numbers || numbers.length < 4 || numbers.some((value) => !Number.isFinite(value))) {
        return null;
    }
    return {
        start: { x: numbers[0], y: numbers[1] },
        end: { x: numbers[2], y: numbers[3] },
    };
}
function localToWorld(node, point) {
    const height = node.h ?? 0;
    const centerX = node.x + node.w / 2;
    const centerY = node.y + height / 2;
    const localX = node.x + point.x;
    const localY = node.y + point.y;
    const angle = ((node.rotation ?? 0) * Math.PI) / 180;
    const dx = localX - centerX;
    const dy = localY - centerY;
    return {
        x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
}
/**
 * Converts legacy line boxes whose height represented the painted stroke into
 * the zero-height path model. Moving y to the former vertical center preserves
 * the exact visible path while removing stroke width from object geometry.
 */
export function normalizeLinearPathNode(node) {
    if (node.type !== "line" && node.type !== "arrow")
        return node;
    if (node.pathData) {
        const localEndpoints = parseLegacyLinearPath(node.pathData);
        if (localEndpoints) {
            const geometry = createLinearPathGeometry(localToWorld(node, localEndpoints.start), localToWorld(node, localEndpoints.end));
            if (geometry) {
                const { pathData: _pathData, ...withoutLegacyPath } = node;
                return { ...withoutLegacyPath, ...geometry };
            }
        }
    }
    if (node.h === 0)
        return node;
    return {
        ...node,
        y: node.y + (node.h ?? 0) / 2,
        h: 0,
    };
}
/**
 * Converts a directed A → B gesture into the horizontal local box used by
 * line/arrow nodes. The box rotates around its center, so its local left and
 * right endpoints land exactly on A and B without losing drag direction.
 */
export function createLinearPathGeometry(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0)
        return null;
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    return {
        x: centerX - length / 2,
        y: centerY,
        w: length,
        h: 0,
        rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
}
/** Recovers the directed world-space endpoints represented by a node box. */
export function getLinearPathEndpoints(geometry) {
    const angle = (geometry.rotation * Math.PI) / 180;
    const halfDx = (Math.cos(angle) * geometry.w) / 2;
    const halfDy = (Math.sin(angle) * geometry.w) / 2;
    const centerX = geometry.x + geometry.w / 2;
    const centerY = geometry.y + geometry.h / 2;
    return {
        start: { x: centerX - halfDx, y: centerY - halfDy },
        end: { x: centerX + halfDx, y: centerY + halfDy },
    };
}
/** Moves one directed endpoint while keeping the opposite endpoint fixed. */
export function resizeLinearPathEndpoint(geometry, handle, point) {
    const endpoints = getLinearPathEndpoints(geometry);
    return createLinearPathGeometry(handle === "start" ? point : endpoints.start, handle === "end" ? point : endpoints.end);
}
/**
 * Commits a completed A → B path and always releases the transient draw state.
 * Keeping both effects in one operation prevents an early return from leaving
 * the preview line mounted after the real node has been created.
 */
export function completeLinearPathDraw(start, end, effects) {
    const geometry = createLinearPathGeometry(start, end);
    if (geometry)
        effects.place(geometry);
    effects.reset();
    return geometry !== null;
}
//# sourceMappingURL=linear-path-geometry.js.map