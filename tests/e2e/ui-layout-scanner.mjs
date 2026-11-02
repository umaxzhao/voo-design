// Generic layout invariants that any visible UI state must satisfy. Feature
// suites assert what their author expected; this scanner catches the
// unexpected (covered controls, clipped labels, page overflow, unnamed
// buttons) without per-feature assertions.

/** Run in the page: returns one finding per violated invariant. */
function collectLayoutFindings({ minTouchTarget }) {
  const findings = [];
  const viewport = { width: innerWidth, height: innerHeight };
  const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]';

  // Stable, human-readable element label used as the allowlist key.
  const describe = (element) => {
    const parts = [];
    for (let node = element; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      const testId = node.getAttribute("data-testid");
      if (testId) part += `[data-testid="${testId}"]`;
      else if (node.id && !/\d{3,}|:/.test(node.id)) part += `#${node.id}`;
      else {
        const named = [...node.classList].find((name) => !/^(is-|has-)|\d{3,}/.test(name));
        if (named) part += `.${named}`;
      }
      parts.unshift(part);
      if (testId) break;
    }
    const name = (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "")
      .trim().replace(/\s+/g, " ").slice(0, 40);
    return name ? `${parts.join(" > ")} "${name}"` : parts.join(" > ");
  };
  const isRendered = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    if (element.closest('[aria-hidden="true"], [inert]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  // Intersect with every clipping ancestor, so content scrolled out of a
  // panel is treated as legitimately hidden rather than "covered".
  const visibleRect = (element) => {
    let { left, top, right, bottom } = element.getBoundingClientRect();
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(hidden|auto|scroll|clip)/.test(style.overflowX + style.overflowY)) {
        const clip = node.getBoundingClientRect();
        left = Math.max(left, clip.left); top = Math.max(top, clip.top);
        right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
      }
    }
    left = Math.max(left, 0); top = Math.max(top, 0);
    right = Math.min(right, viewport.width); bottom = Math.min(bottom, viewport.height);
    return right - left >= 1 && bottom - top >= 1 ? { left, top, right, bottom } : null;
  };
  const add = (kind, element, detail) => findings.push({ kind, target: describe(element), detail });

  const scroller = document.scrollingElement;
  if (scroller.scrollWidth > viewport.width + 1) {
    findings.push({ kind: "page-overflow-x", target: "document", detail: `${scroller.scrollWidth}px > ${viewport.width}px` });
  }

  // While a menu or dialog is open, controls behind it are covered by
  // design; only the open layers' own controls are checked for occlusion.
  // (listbox is excluded: the layers tree is a permanent listbox.)
  const overlays = [...document.querySelectorAll('[role="menu"], [role="dialog"], [aria-modal="true"]')]
    .filter(isRendered);
  const behindOverlay = (element) => overlays.length > 0 && !overlays.some((overlay) => overlay.contains(element));

  for (const element of document.querySelectorAll(INTERACTIVE)) {
    if (!isRendered(element) || element.disabled) continue;
    const rect = element.getBoundingClientRect();
    const visible = visibleRect(element);
    if (!visible) continue;
    // Partially outside the window with no scroll container to reach it.
    if (rect.left < -1 || rect.right > viewport.width + 1) {
      const scrollable = (() => {
        for (let node = element.parentElement; node; node = node.parentElement) {
          if (node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
        }
        return false;
      })();
      if (!scrollable) add("offscreen", element, `x ${Math.round(rect.left)}..${Math.round(rect.right)} of ${viewport.width}`);
    }
    // Something else is painted over the control's visible centre.
    const x = (visible.left + visible.right) / 2;
    const y = (visible.top + visible.bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && !behindOverlay(element) && hit !== element && !element.contains(hit) && !hit.contains(element)
      && !element.closest("label")?.contains(hit)) {
      add("covered", element, `covered by ${describe(hit)}`);
    }
    const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby")
      || element.getAttribute("title") || element.textContent.trim()
      || element.getAttribute("placeholder") || element.labels?.[0]?.textContent.trim()
      || element.querySelector("img[alt]")?.getAttribute("alt");
    if (!name && !["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)) add("unnamed-control", element, "no text, aria-label or title");
    if (minTouchTarget && (rect.width < minTouchTarget || rect.height < minTouchTarget)) {
      add("small-touch-target", element, `${Math.round(rect.width)}x${Math.round(rect.height)} < ${minTouchTarget}`);
    }
  }

  // Text that is cut off without an ellipsis reads as a rendering bug.
  for (const element of document.querySelectorAll("body *")) {
    if (!element.childNodes.length || ![...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) continue;
    if (!isRendered(element) || !visibleRect(element)) continue;
    // Screen-reader-only text is clipped to 1x1 on purpose.
    if (element.clientWidth <= 1 && element.clientHeight <= 1) continue;
    const style = getComputedStyle(element);
    if (style.textOverflow === "ellipsis" || !/(hidden|clip)/.test(style.overflowX + style.overflowY)) continue;
    if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 2) {
      add("clipped-text", element, `${element.scrollWidth}x${element.scrollHeight} in ${element.clientWidth}x${element.clientHeight}`);
    }
  }
  return findings;
}

/**
 * Scan the current page state. `allow` holds `{ kind, target }` entries with
 * a reason; they document accepted exceptions instead of silencing a kind.
 */
export async function scanLayout(page, { state, allow = [], minTouchTarget = 0 } = {}) {
  const findings = await page.evaluate(collectLayoutFindings, { minTouchTarget });
  const unique = [...new Map(findings.map((finding) => [`${finding.kind}|${finding.target}`, finding])).values()];
  const allowed = (finding) => allow.some((entry) => entry.kind === finding.kind
    && (entry.target instanceof RegExp ? entry.target.test(finding.target) : finding.target.startsWith(entry.target)));
  return {
    state,
    violations: unique.filter((finding) => !allowed(finding)),
    accepted: unique.filter(allowed),
  };
}
