/** Inspect actual interface paint; artwork, guides and keyboard focus are separate. */
export async function scanUiBorders(page) {
  return page.evaluate(() => {
    const findings = [];
    const alpha = (color) =>
      color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color);
    for (const el of document.querySelectorAll("body *")) {
      if (
        !(el instanceof HTMLElement) ||
        el.closest(
          '[data-ui-guide], [data-testid="editor-pages"], [data-editor-artboard]',
        )
      )
        continue;
      const rect = el.getBoundingClientRect();
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      )
        continue;
      const style = getComputedStyle(el);
      if (
        style.visibility !== "visible" ||
        style.display === "none" ||
        Number(style.opacity) === 0 ||
        el.closest("[inert], [hidden]")
      )
        continue;
      const sides = ["Top", "Right", "Bottom", "Left"].filter(
        (side) =>
          parseFloat(style[`border${side}Width`]) > 0 &&
          !["none", "hidden"].includes(style[`border${side}Style`]) &&
          alpha(style[`border${side}Color`]),
      );
      const ring = style.boxShadow;
      const keyboardFocus =
        el.matches(":focus-visible") ||
        (el.className.includes("peer-focus-visible:") &&
          el.parentElement?.querySelector(":scope > .peer:focus-visible"));
      const hasRing =
        !keyboardFocus &&
        /\s0px\s0px\s0px\s[1-9][\d.]*px/.test(ring) &&
        !/rgba\(0, 0, 0, 0\)/.test(ring);
      if (sides.length || hasRing)
        findings.push({
          tag: el.tagName,
          id: el.getAttribute("data-testid"),
          label: el.getAttribute("aria-label"),
          classes: el.className,
          sides,
          ring: hasRing ? ring : undefined,
        });
    }
    return findings;
  });
}
