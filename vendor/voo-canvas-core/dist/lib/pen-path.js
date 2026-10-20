const committedPenPathTokens = new WeakSet();
/**
 * Claims the current draft for one finish trigger. Escape, toolbar switching,
 * and the active-tool subscription can fire in the same event turn; clearing
 * the shared guard synchronously prevents duplicate overlapping Pen nodes.
 */
export function claimPenPathCommit(requestedState) {
    if (committedPenPathTokens.has(requestedState.commitToken))
        return null;
    committedPenPathTokens.add(requestedState.commitToken);
    return requestedState;
}
export function startPenPath(point) {
    return { anchors: [{ ...point }], closed: false, commitToken: {} };
}
export function appendPenAnchor(state, point) {
    if (state.closed)
        return state;
    return { ...state, anchors: [...state.anchors, { ...point }] };
}
/** Starts another sub-path while preserving a previously closed last path. */
export function startDisconnectedPenSubPath(state, point) {
    const anchors = state.anchors.map((anchor) => ({ ...anchor }));
    if (state.closed && anchors.length > 0) {
        const lastIndex = anchors.length - 1;
        anchors[lastIndex] = { ...anchors[lastIndex], closeSubPath: true };
    }
    return {
        ...state,
        anchors: [...anchors, { ...point, disconnect: true }],
        closed: false,
    };
}
/**
 * Drags the control handle of the latest anchor.
 * - Normal drag: mirrors handleIn as the opposite of handleOut (smooth curve).
 * - Alt-drag (altKey=true): moves only handleOut, leaves handleIn unchanged
 *   ("broken handle" / corner point in Illustrator/Figma).
 */
export function dragLatestPenHandle(state, pointer, altKey = false) {
    if (state.closed || state.anchors.length === 0)
        return state;
    const anchors = [...state.anchors];
    const latest = anchors[anchors.length - 1];
    if (altKey) {
        // Broken handle: only update handleOut, keep handleIn as-is
        anchors[anchors.length - 1] = {
            ...latest,
            handleOut: { ...pointer },
        };
    }
    else {
        anchors[anchors.length - 1] = {
            ...latest,
            handleIn: {
                x: latest.x * 2 - pointer.x,
                y: latest.y * 2 - pointer.y,
            },
            handleOut: { ...pointer },
        };
    }
    return { ...state, anchors };
}
export function movePenAnchor(anchors, index, point) {
    const target = anchors[index];
    if (!target)
        return [...anchors];
    const deltaX = point.x - target.x;
    const deltaY = point.y - target.y;
    return anchors.map((anchor, anchorIndex) => {
        if (anchorIndex !== index)
            return { ...anchor };
        return {
            ...anchor,
            x: point.x,
            y: point.y,
            ...(anchor.handleIn
                ? {
                    handleIn: {
                        x: anchor.handleIn.x + deltaX,
                        y: anchor.handleIn.y + deltaY,
                    },
                }
                : {}),
            ...(anchor.handleOut
                ? {
                    handleOut: {
                        x: anchor.handleOut.x + deltaX,
                        y: anchor.handleOut.y + deltaY,
                    },
                }
                : {}),
        };
    });
}
export function movePenHandle(anchors, index, handleType, point, symmetric = true) {
    const target = anchors[index];
    if (!target)
        return [...anchors];
    return anchors.map((anchor, anchorIndex) => {
        if (anchorIndex !== index)
            return { ...anchor };
        if (handleType === "in") {
            const handleIn = { ...point };
            let handleOut = anchor.handleOut;
            if (symmetric && handleOut) {
                const dx = handleIn.x - anchor.x;
                const dy = handleIn.y - anchor.y;
                const lenOut = Math.hypot(handleOut.x - anchor.x, handleOut.y - anchor.y);
                const lenIn = Math.hypot(dx, dy) || 1;
                handleOut = {
                    x: anchor.x - (dx / lenIn) * lenOut,
                    y: anchor.y - (dy / lenIn) * lenOut,
                };
            }
            return {
                ...anchor,
                handleIn,
                ...(handleOut ? { handleOut } : {}),
            };
        }
        else {
            const handleOut = { ...point };
            let handleIn = anchor.handleIn;
            if (symmetric && handleIn) {
                const dx = handleOut.x - anchor.x;
                const dy = handleOut.y - anchor.y;
                const lenIn = Math.hypot(handleIn.x - anchor.x, handleIn.y - anchor.y);
                const lenOut = Math.hypot(dx, dy) || 1;
                handleIn = {
                    x: anchor.x - (dx / lenOut) * lenIn,
                    y: anchor.y - (dy / lenOut) * lenIn,
                };
            }
            return {
                ...anchor,
                handleOut,
                ...(handleIn ? { handleIn } : {}),
            };
        }
    });
}
/**
 * Deletes an anchor at `index` and re-bridges the surrounding curve.
 * If the anchor was the only one in its sub-path the sub-path is dropped.
 * The `disconnect` flag on the *next* anchor is cleared when the preceding
 * sub-path end is removed, because the gap is now gone.
 */
export function deletePenAnchor(anchors, index) {
    if (anchors.length <= 1)
        return [];
    const next = [...anchors];
    const deletedAnchor = anchors[index];
    next.splice(index, 1);
    if (deletedAnchor?.closeSubPath && index > 0 && next[index - 1]) {
        next[index - 1] = { ...next[index - 1], closeSubPath: true };
    }
    // If the deleted anchor was the start of a sub-path (disconnect=true),
    // promote its disconnect flag to the next anchor (now at same index),
    // unless that next anchor was already the very first anchor overall.
    if (index < next.length && index > 0) {
        const wasSubPathStart = anchors[index].disconnect;
        if (wasSubPathStart) {
            next[index] = { ...next[index], disconnect: true };
        }
    }
    // If anchor 0 was deleted, anchor 1 becomes anchor 0 and must not carry
    // disconnect (there is no preceding sub-path anymore).
    if (index === 0 && next.length > 0 && next[0].disconnect) {
        const { disconnect: _d, ...rest } = next[0];
        next[0] = rest;
    }
    return next;
}
/**
 * Evaluates a cubic Bézier at parameter t in one dimension.
 * p0, p1, p2, p3 are the four control point coordinates.
 */
function cubicBezier(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return (mt * mt * mt * p0 +
        3 * mt * mt * t * p1 +
        3 * mt * t * t * p2 +
        t * t * t * p3);
}
function pointOnPenSegment(from, to, t) {
    const controlOut = from.handleOut ?? from;
    const controlIn = to.handleIn ?? to;
    return {
        x: cubicBezier(from.x, controlOut.x, controlIn.x, to.x, t),
        y: cubicBezier(from.y, controlOut.y, controlIn.y, to.y, t),
    };
}
function editablePenSegments(anchors, closed) {
    const segments = [];
    for (let index = 0; index < anchors.length - 1; index += 1) {
        if (!anchors[index + 1].disconnect) {
            segments.push({ fromIndex: index, toIndex: index + 1 });
        }
        if (anchors[index].closeSubPath) {
            let subPathStartIndex = index;
            while (subPathStartIndex > 0 && !anchors[subPathStartIndex].disconnect) {
                subPathStartIndex -= 1;
            }
            if (index > subPathStartIndex) {
                segments.push({ fromIndex: index, toIndex: subPathStartIndex });
            }
        }
    }
    const lastIndex = anchors.length - 1;
    if (lastIndex >= 0 && anchors[lastIndex].closeSubPath) {
        let subPathStartIndex = lastIndex;
        while (subPathStartIndex > 0 && !anchors[subPathStartIndex].disconnect) {
            subPathStartIndex -= 1;
        }
        if (lastIndex > subPathStartIndex) {
            segments.push({ fromIndex: lastIndex, toIndex: subPathStartIndex });
        }
    }
    if (closed && anchors.length > 1) {
        let subPathStartIndex = 0;
        for (let index = anchors.length - 1; index > 0; index -= 1) {
            if (anchors[index].disconnect) {
                subPathStartIndex = index;
                break;
            }
        }
        if (anchors.length - subPathStartIndex > 1 &&
            !anchors[anchors.length - 1].closeSubPath) {
            segments.push({
                fromIndex: anchors.length - 1,
                toIndex: subPathStartIndex,
            });
        }
    }
    return segments;
}
function cubicExtrema(start, controlStart, controlEnd, end) {
    const a = -start + 3 * controlStart - 3 * controlEnd + end;
    const b = 2 * (start - 2 * controlStart + controlEnd);
    const c = controlStart - start;
    if (Math.abs(a) < 1e-9) {
        if (Math.abs(b) < 1e-9)
            return [];
        const t = -c / b;
        return t > 0 && t < 1 ? [t] : [];
    }
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return [];
    const root = Math.sqrt(discriminant);
    return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter((t) => t > 0 && t < 1);
}
/** Calculates the visible curve bounds, excluding unused control handles. */
export function calculatePenPathBounds(anchors, closed) {
    if (anchors.length === 0)
        return null;
    const points = anchors.map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
    }));
    for (const segment of editablePenSegments(anchors, closed)) {
        const from = anchors[segment.fromIndex];
        const to = anchors[segment.toIndex];
        const controlOut = from.handleOut ?? from;
        const controlIn = to.handleIn ?? to;
        const extrema = new Set([
            ...cubicExtrema(from.x, controlOut.x, controlIn.x, to.x),
            ...cubicExtrema(from.y, controlOut.y, controlIn.y, to.y),
        ]);
        extrema.forEach((t) => points.push(pointOnPenSegment(from, to, t)));
    }
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}
/** Finds the actual Bézier segment nearest to a pointer in the same space. */
export function findClosestPenSegment(anchors, closed, pointer) {
    const segments = editablePenSegments(anchors, closed);
    let closest = null;
    const COARSE_STEPS = 32;
    const REFINE_STEPS = 6;
    for (const segment of segments) {
        const from = anchors[segment.fromIndex];
        const to = anchors[segment.toIndex];
        let bestT = 0;
        let bestPoint = pointOnPenSegment(from, to, 0);
        let bestDistance = Math.hypot(bestPoint.x - pointer.x, bestPoint.y - pointer.y);
        for (let step = 1; step <= COARSE_STEPS; step += 1) {
            const t = step / COARSE_STEPS;
            const point = pointOnPenSegment(from, to, t);
            const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPoint = point;
                bestT = t;
            }
        }
        let rangeStart = Math.max(0, bestT - 1 / COARSE_STEPS);
        let rangeEnd = Math.min(1, bestT + 1 / COARSE_STEPS);
        for (let step = 0; step < REFINE_STEPS; step += 1) {
            const leftT = rangeStart + (rangeEnd - rangeStart) / 3;
            const rightT = rangeEnd - (rangeEnd - rangeStart) / 3;
            const leftPoint = pointOnPenSegment(from, to, leftT);
            const rightPoint = pointOnPenSegment(from, to, rightT);
            const leftDistance = Math.hypot(leftPoint.x - pointer.x, leftPoint.y - pointer.y);
            const rightDistance = Math.hypot(rightPoint.x - pointer.x, rightPoint.y - pointer.y);
            if (leftDistance <= rightDistance) {
                rangeEnd = rightT;
                bestT = leftT;
                bestPoint = leftPoint;
                bestDistance = leftDistance;
            }
            else {
                rangeStart = leftT;
                bestT = rightT;
                bestPoint = rightPoint;
                bestDistance = rightDistance;
            }
        }
        if (!closest || bestDistance < closest.distance) {
            closest = {
                ...segment,
                distance: bestDistance,
                point: bestPoint,
                t: bestT,
            };
        }
    }
    return closest;
}
/**
 * Inserts a new anchor on the cubic Bézier segment between anchor[fromIndex]
 * and anchor[fromIndex+1] at parameter t (0–1).  The two surrounding anchors
 * get updated handles so the curve shape is preserved (de Casteljau split).
 * Returns the full updated anchor list.
 */
export function insertAnchorOnSegment(anchors, fromIndex, t, toIndex = fromIndex + 1) {
    if (fromIndex < 0 ||
        fromIndex >= anchors.length ||
        toIndex < 0 ||
        toIndex >= anchors.length ||
        fromIndex === toIndex) {
        return [...anchors];
    }
    const a = anchors[fromIndex];
    const b = anchors[toIndex];
    const curved = Boolean(a.handleOut || b.handleIn);
    // Control points for the cubic Bézier
    const p0 = { x: a.x, y: a.y };
    const p1 = a.handleOut ?? { x: a.x, y: a.y };
    const p2 = b.handleIn ?? { x: b.x, y: b.y };
    const p3 = { x: b.x, y: b.y };
    // de Casteljau first level
    const q0 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
    const q1 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    const q2 = { x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) };
    // de Casteljau second level
    const r0 = { x: q0.x + t * (q1.x - q0.x), y: q0.y + t * (q1.y - q0.y) };
    const r1 = { x: q1.x + t * (q2.x - q1.x), y: q1.y + t * (q2.y - q1.y) };
    // Split point
    const s = {
        x: cubicBezier(p0.x, p1.x, p2.x, p3.x, t),
        y: cubicBezier(p0.y, p1.y, p2.y, p3.y, t),
    };
    const updatedA = {
        ...a,
        ...(a.handleOut ? { handleOut: q0 } : {}),
    };
    const newAnchor = {
        x: s.x,
        y: s.y,
        ...(curved ? { handleIn: r0, handleOut: r1 } : {}),
    };
    const updatedB = {
        ...b,
        ...(b.handleIn ? { handleIn: q2 } : {}),
    };
    const result = anchors.map((anchor) => ({ ...anchor }));
    if (toIndex === fromIndex + 1) {
        result.splice(fromIndex, 2, updatedA, newAnchor, updatedB);
        return result;
    }
    if (fromIndex === anchors.length - 1 && toIndex < fromIndex) {
        result[fromIndex] = updatedA;
        result[toIndex] = updatedB;
        result.push(newAnchor);
        return result;
    }
    return result;
}
/**
 * Toggles an anchor between smooth (mirrored handles) and corner (independent
 * handles).  A smooth anchor has at least one handle; a corner anchor has none.
 * - Smooth → Corner: strips both handles (Figma's Alt+click behaviour).
 * - Corner → Smooth: synthesises symmetric handles tangent to the segment
 *   direction (1/3 of segment length on each side).
 */
export function toggleAnchorType(anchors, index) {
    const anchor = anchors[index];
    if (!anchor)
        return [...anchors];
    const isSmooth = !!(anchor.handleIn ?? anchor.handleOut);
    if (isSmooth) {
        // Smooth → Corner: remove all handles
        const { handleIn: _hi, handleOut: _ho, ...rest } = anchor;
        return anchors.map((a, i) => i === index ? rest : { ...a });
    }
    // Corner → Smooth: synthesise handles from neighbouring anchors
    const prev = anchors[index - 1];
    const next = anchors[index + 1];
    const RATIO = 1 / 3;
    let handleIn;
    let handleOut;
    if (prev && !anchor.disconnect) {
        handleIn = {
            x: anchor.x + (prev.x - anchor.x) * RATIO,
            y: anchor.y + (prev.y - anchor.y) * RATIO,
        };
    }
    if (next && !next.disconnect) {
        handleOut = {
            x: anchor.x + (next.x - anchor.x) * RATIO,
            y: anchor.y + (next.y - anchor.y) * RATIO,
        };
    }
    return anchors.map((a, i) => i === index
        ? {
            ...a,
            ...(handleIn ? { handleIn } : {}),
            ...(handleOut ? { handleOut } : {}),
        }
        : { ...a });
}
export function closePenPathNearStart(state, point, threshold) {
    if (state.closed || state.anchors.length < 2)
        return state;
    let subPathStartIndex = 0;
    for (let index = state.anchors.length - 1; index > 0; index -= 1) {
        if (state.anchors[index].disconnect) {
            subPathStartIndex = index;
            break;
        }
    }
    if (state.anchors.length - subPathStartIndex < 2)
        return state;
    const first = state.anchors[subPathStartIndex];
    const distance = Math.hypot(point.x - first.x, point.y - first.y);
    if (distance > threshold)
        return state;
    if (subPathStartIndex === 0)
        return { ...state, closed: true };
    const anchors = state.anchors.map((anchor, index) => index === state.anchors.length - 1
        ? { ...anchor, closeSubPath: true }
        : { ...anchor });
    return { ...state, anchors, closed: false };
}
/** Resolve a click while a Pen path is already in progress. */
export function resolvePenPointerDown(state, point, options) {
    const closedState = closePenPathNearStart(state, point, options.closeThreshold);
    if (closedState !== state) {
        return { state: closedState, shouldCommit: true };
    }
    if (options.clickCount >= 2) {
        return {
            state,
            shouldCommit: state.anchors.length >= 2,
        };
    }
    return {
        state: appendPenAnchor(state, point),
        shouldCommit: false,
    };
}
/** Drop trailing anchors that sit within `tolerance` of the previous one.
 *  Double-click commits fire after the second pointerdown already appended
 *  a duplicate of the final anchor (Chromium reports event.detail = 0 on
 *  pointerdown, so the dup cannot be filtered out earlier). */
export function dropTrailingDuplicateAnchors(state, tolerance) {
    const anchors = [...state.anchors];
    while (anchors.length > 1) {
        const last = anchors[anchors.length - 1];
        const prev = anchors[anchors.length - 2];
        if (Math.hypot(last.x - prev.x, last.y - prev.y) > tolerance)
            break;
        anchors.pop();
    }
    return anchors.length === state.anchors.length
        ? state
        : { ...state, anchors };
}
export function buildPenPathData(anchors, closed) {
    if (anchors.length === 0)
        return "";
    const commands = [];
    const appendSegment = (from, to) => {
        if (from.handleOut || to.handleIn) {
            const controlOut = from.handleOut ?? from;
            const controlIn = to.handleIn ?? to;
            commands.push(`C ${controlOut.x} ${controlOut.y} ${controlIn.x} ${controlIn.y} ${to.x} ${to.y}`);
        }
        else {
            commands.push(`L ${to.x} ${to.y}`);
        }
    };
    let subPathStartIndex = 0;
    for (let index = 0; index < anchors.length; index += 1) {
        const anchor = anchors[index];
        if (index === 0 || anchor.disconnect) {
            if (index > 0 &&
                anchors[index - 1].closeSubPath &&
                index - subPathStartIndex > 1) {
                appendSegment(anchors[index - 1], anchors[subPathStartIndex]);
                commands.push("Z");
            }
            commands.push(`M ${anchor.x} ${anchor.y}`);
            subPathStartIndex = index;
        }
        else {
            appendSegment(anchors[index - 1], anchor);
        }
    }
    if ((closed || anchors[anchors.length - 1].closeSubPath) &&
        anchors.length - subPathStartIndex > 1) {
        appendSegment(anchors[anchors.length - 1], anchors[subPathStartIndex]);
        commands.push("Z");
    }
    return commands.join(" ");
}
export function scalePenGeometry(anchors, closed, scaleX, scaleY) {
    const scalePoint = (point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
    });
    const vectorAnchors = anchors.map((anchor) => ({
        x: anchor.x * scaleX,
        y: anchor.y * scaleY,
        ...(anchor.handleIn ? { handleIn: scalePoint(anchor.handleIn) } : {}),
        ...(anchor.handleOut ? { handleOut: scalePoint(anchor.handleOut) } : {}),
        disconnect: anchor.disconnect,
        closeSubPath: anchor.closeSubPath,
    }));
    return {
        vectorAnchors,
        pathData: buildPenPathData(vectorAnchors, closed),
    };
}
/** Maps a canvas-space pointer into the editable local coordinates of a Pen. */
export function worldPointToPenLocal(geometry, point) {
    const centerX = geometry.x + geometry.w / 2;
    const centerY = geometry.y + geometry.h / 2;
    const angle = -((geometry.rotation ?? 0) * Math.PI) / 180;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
    return {
        x: geometry.w / 2 + (geometry.flipH ? -rotatedX : rotatedX),
        y: geometry.h / 2 + (geometry.flipV ? -rotatedY : rotatedY),
    };
}
/** Maps a Pen-local point into canvas world coordinates. */
export function penLocalPointToWorld(geometry, point) {
    const centerX = geometry.x + geometry.w / 2;
    const centerY = geometry.y + geometry.h / 2;
    const localX = point.x - geometry.w / 2;
    const localY = point.y - geometry.h / 2;
    const flippedX = geometry.flipH ? -localX : localX;
    const flippedY = geometry.flipV ? -localY : localY;
    const angle = ((geometry.rotation ?? 0) * Math.PI) / 180;
    return {
        x: centerX + flippedX * Math.cos(angle) - flippedY * Math.sin(angle),
        y: centerY + flippedX * Math.sin(angle) + flippedY * Math.cos(angle),
    };
}
/**
 * Rebuilds a Pen's local bounds after an anchor edit without changing the
 * world-space position of its rotated or flipped path.
 */
export function reframeEditedPenPath(geometry, anchors, closed, style) {
    const patch = finalizePenPath({ anchors: [...anchors], closed }, style);
    if (!patch)
        return null;
    const localCenterDelta = {
        x: patch.x + patch.w / 2 - geometry.w / 2,
        y: patch.y + patch.h / 2 - geometry.h / 2,
    };
    const flippedX = geometry.flipH ? -localCenterDelta.x : localCenterDelta.x;
    const flippedY = geometry.flipV ? -localCenterDelta.y : localCenterDelta.y;
    const angle = ((geometry.rotation ?? 0) * Math.PI) / 180;
    const worldCenterDelta = {
        x: flippedX * Math.cos(angle) - flippedY * Math.sin(angle),
        y: flippedX * Math.sin(angle) + flippedY * Math.cos(angle),
    };
    const oldCenterX = geometry.x + geometry.w / 2;
    const oldCenterY = geometry.y + geometry.h / 2;
    return {
        x: oldCenterX + worldCenterDelta.x - patch.w / 2,
        y: oldCenterY + worldCenterDelta.y - patch.h / 2,
        w: patch.w,
        h: patch.h,
        pathData: patch.pathData,
        vectorAnchors: patch.vectorAnchors,
    };
}
export function finalizePenPath(state, style) {
    if (state.anchors.length < 2)
        return null;
    const bounds = calculatePenPathBounds(state.anchors, state.closed);
    if (!bounds)
        return null;
    const halfStroke = Math.max(0.5, style.width / 2);
    const originX = bounds.minX - halfStroke;
    const originY = bounds.minY - halfStroke;
    const normalizePoint = (point) => ({
        x: point.x - originX,
        y: point.y - originY,
    });
    const vectorAnchors = state.anchors.map((anchor) => ({
        // Spread anchor first so disconnect, closed, etc. are preserved, then
        // override x/y with the normalized (origin-relative) coordinates.
        ...anchor,
        ...normalizePoint(anchor),
        ...(anchor.handleIn
            ? { handleIn: normalizePoint(anchor.handleIn) }
            : { handleIn: undefined }),
        ...(anchor.handleOut
            ? { handleOut: normalizePoint(anchor.handleOut) }
            : { handleOut: undefined }),
    }));
    return {
        type: "pen",
        parentId: null,
        x: originX,
        y: originY,
        w: Math.max(1, bounds.maxX - bounds.minX + halfStroke * 2),
        h: Math.max(1, bounds.maxY - bounds.minY + halfStroke * 2),
        pathData: buildPenPathData(vectorAnchors, state.closed),
        vectorClosed: state.closed,
        vectorAnchors,
        strokeColor: style.color,
        strokeWidth: style.width,
        strokeLineCap: "round",
        strokeLineJoin: "round",
        fillVisible: false,
    };
}
/** Snaps a point relative to a reference point to horizontal, vertical, or 45-degree diagonal. */
export function constrainPoint45(point, relativeTo) {
    const dx = point.x - relativeTo.x;
    const dy = point.y - relativeTo.y;
    if (dx === 0 && dy === 0)
        return point;
    const angle = Math.atan2(dy, dx);
    const nearestAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const cos = Math.cos(nearestAngle);
    const sin = Math.sin(nearestAngle);
    const d = dx * cos + dy * sin;
    return {
        x: relativeTo.x + d * cos,
        y: relativeTo.y + d * sin,
    };
}
/** Snaps the handle direction relative to its anchor to 45-degree increments while preserving distance. */
export function constrainHandle45(handle, anchor) {
    const dx = handle.x - anchor.x;
    const dy = handle.y - anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0)
        return handle;
    const angle = Math.atan2(dy, dx);
    const nearestAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
        x: anchor.x + dist * Math.cos(nearestAngle),
        y: anchor.y + dist * Math.sin(nearestAngle),
    };
}
//# sourceMappingURL=pen-path.js.map