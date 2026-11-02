import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LoadingModal from "../../src/canvas/components/loading_modal.jsx";

const render = props => renderToStaticMarkup(createElement(LoadingModal, { label: "Loading editor", showLabel: false, ...props }));

describe("brand loading feedback", () => {
  it("uses the canonical brand above one neutral progress bar", () => {
    const html = render();
    expect(html).toContain("data-loading-brand");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('role="progressbar"');
    expect(html.indexOf("data-loading-brand")).toBeLessThan(html.indexOf('role="progressbar"'));
    expect(html).not.toContain("#E5B2FF");
    expect(html).toContain('class="sr-only">Loading editor');
    expect(html).not.toContain("aria-valuenow");
  });

  it.each([[0, 0], [42.6, 43], [100, 100], [-2, 0], [125, 100]])(
    "preserves real progress %s as accessible value %s",
    (progress, value) => {
      const html = render({ progress });
      expect(html).toContain(`aria-valuenow="${value}"`);
      expect(html).toContain(`transform:scaleX(${value / 100})`);
      expect(html).not.toContain("voo-loading-segment");
    },
  );

  it.each([null, undefined, NaN, Infinity])("keeps unknown progress %s indeterminate", progress => {
    const html = render({ progress });
    expect(html).toContain('data-loading-progress="indeterminate"');
    expect(html).not.toContain("aria-valuenow");
  });

  it("retains useful task phase labels outside the minimal entry screen", () => {
    const html = render({ showLabel: true });
    expect(html).not.toContain('class="sr-only"');
    expect(html).toContain("Loading editor");
  });

  it("keeps the existing optional cancellation entry", () => {
    expect(render()).not.toContain("loading-modal-cancel");
    expect(render({ onCancel: vi.fn() })).toContain('data-testid="loading-modal-cancel"');
  });
});
