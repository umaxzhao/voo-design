import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal overflow state for the project tab strip.
 *
 * The strip is the only place where tabs are listable: the bar has a fixed
 * width, so once the projects outgrow it the edges are the only way to reach
 * the hidden ones. The hook owns that edge state (which side hides content),
 * the scroll step, and keeping the active tab reachable, so the component
 * stays a description of the bar rather than a scroll implementation.
 */
const EDGE_EPSILON = 1;

export function useTabBarOverflow({ activeId, tabCount }) {
  const scrollRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const remaining = node.scrollWidth - node.clientWidth - node.scrollLeft;
    const left = node.scrollLeft > EDGE_EPSILON;
    const right = remaining > EDGE_EPSILON;
    setEdges((current) =>
      current.left === left && current.right === right
        ? current
        : { left, right },
    );
  }, []);

  /** Moves by most of a viewport, so the previous tabs stay for orientation. */
  const scrollByStep = useCallback((direction) => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(120, Math.round(node.clientWidth * 0.7)),
      behavior: "smooth",
    });
  }, []);

  /** Brings one tab fully into view without moving the whole window. */
  const ensureVisible = useCallback((id) => {
    const node = scrollRef.current;
    const tab = id ? node?.querySelector(`[data-tab-id="${id}"]`) : null;
    if (!node || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < node.scrollLeft) node.scrollLeft = left;
    else if (right > node.scrollLeft + node.clientWidth) {
      node.scrollLeft = right - node.clientWidth;
    }
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    node.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    measure();
    return () => {
      node.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  // Opening, switching or closing a project changes which tab is current; the
  // bar scrolls to it so the user never loses the project they just opened.
  // Showing an edge arrow narrows the viewport, so the reveal repeats over the
  // next few frames until the settled layout keeps the tab fully in view. It
  // never reacts to the user's own scrolling, only to a changed active tab.
  useEffect(() => {
    let frame = null;
    const reveal = (passes) => {
      ensureVisible(activeId);
      measure();
      if (passes > 1 && typeof requestAnimationFrame === "function") {
        frame = requestAnimationFrame(() => reveal(passes - 1));
      }
    };
    reveal(4);
    return () => {
      if (frame && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
    };
  }, [activeId, tabCount, ensureVisible, measure]);

  return {
    scrollRef,
    canScrollLeft: edges.left,
    canScrollRight: edges.right,
    scrollByStep,
  };
}
