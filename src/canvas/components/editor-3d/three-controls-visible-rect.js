/** Intersect CSS-pixel bounds; device pixels belong to the renderer only. */
export function intersectVisibleRect(rect, clip, clipX = true, clipY = true) {
  return {
    left: clipX ? Math.max(rect.left, clip.left) : rect.left,
    right: clipX ? Math.min(rect.right, clip.right) : rect.right,
    top: clipY ? Math.max(rect.top, clip.top) : rect.top,
    bottom: clipY ? Math.min(rect.bottom, clip.bottom) : rect.bottom,
  };
}

/** The frame can be larger than the editor stage after free-canvas pan/zoom. */
export function visibleThreeControlsRect(frame) {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  let visible = intersectVisibleRect(frame.getBoundingClientRect(), {
    left,
    top,
    right: left + (viewport?.width ?? window.innerWidth),
    bottom: top + (viewport?.height ?? window.innerHeight),
  });
  for (
    let parent = frame.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const clipX = /^(hidden|clip|scroll|auto)$/.test(style.overflowX);
    const clipY = /^(hidden|clip|scroll|auto)$/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const bounds = parent.getBoundingClientRect();
    const scaleX = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1;
    const scaleY = parent.offsetHeight
      ? bounds.height / parent.offsetHeight
      : 1;
    const clipLeft = bounds.left + parent.clientLeft * scaleX;
    const clipTop = bounds.top + parent.clientTop * scaleY;
    visible = intersectVisibleRect(
      visible,
      {
        left: clipLeft,
        top: clipTop,
        right: clipLeft + parent.clientWidth * scaleX,
        bottom: clipTop + parent.clientHeight * scaleY,
      },
      clipX,
      clipY,
    );
  }
  return visible.right > visible.left && visible.bottom > visible.top
    ? visible
    : null;
}
